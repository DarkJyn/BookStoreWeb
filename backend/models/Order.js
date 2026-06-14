/**
 * Model: Order (SQL Server)
 * Bảng chính : oltp.Sales_Order     (order_id, customer_id, order_date, order_status,
 *                                     total_amount, shipping_address)
 * Bảng chi tiết: oltp.Sales_Order_Item (order_item_id, order_id, book_id, quantity,
 *                                        unit_price, discount_amount, line_total)
 * 
 * Pattern giống Book.js — class JS thuần, thao tác trực tiếp SQL Server.
 */
const {
  sql,
  getPool,
  intToHexId,
  hexIdToInt,
  QueryChain
} = require('../config/db');
const Book = require('./Book');

// ─── Class ────────────────────────────────────────────────────────────────────

class Order {
  /**
   * Constructor nhận row từ SQL, danh sách items, user object
   * @param {Object} row       - row từ oltp.Sales_Order
   * @param {Array}  items     - mảng items đã populated (hoặc [])
   * @param {Object} user      - user object (hoặc null)
   * @param {Boolean} isNew    - true nếu là order mới chưa lưu
   */
  constructor(row, items = [], user = null, isNew = true) {
    this.isNew = isNew;

    this._id       = row.order_id ? intToHexId(row.order_id) : null;
    this.id        = this._id;
    this.orderId   = row.order_id || null;

    // User / Customer
    this.user       = user || row.customer_id || null;
    this.customerId = row.customer_id || null;

    // Timestamps
    this.createdAt   = row.order_date   || row.created_at || null;
    this.updatedAt   = row.order_date   || null;
    this.order_date  = row.order_date   || null;

    // Status & payment
    this.status        = row.order_status    || 'Pending';
    this.paymentMethod = row.payment_method  || 'COD';
    this.isPaid        = Boolean(row.is_paid);
    this.paidAt        = row.paid_at         || null;
    this.isDelivered   = Boolean(row.is_delivered);
    this.deliveredAt   = row.delivered_at    || null;

    // Amounts
    this.subtotal    = Number(row.subtotal      || 0);
    this.discount    = Number(row.discount      || 0);
    this.tax         = Number(row.tax           || 0);
    this.shippingFee = Number(row.shipping_fee  || 0);
    this.total       = Number(row.total_amount  || 0);

    // Shipping address (lưu dạng chuỗi thường hoặc JSON string)
    if (row.shipping_address) {
      if (typeof row.shipping_address === 'string') {
        const cleanAddr = row.shipping_address.trim();
        if (cleanAddr.startsWith('{') && cleanAddr.endsWith('}')) {
          try {
            this.shippingAddress = JSON.parse(cleanAddr);
          } catch (_) {
            this.shippingAddress = { address: row.shipping_address };
          }
        } else {
          this.shippingAddress = { address: row.shipping_address };
        }
      } else {
        this.shippingAddress = row.shipping_address;
      }
    } else {
      this.shippingAddress = {};
    }

    // Items
    this.items = items || [];
  }

  // ─── Static: Create ─────────────────────────────────────────────────────────

  /**
   * Tạo đơn hàng mới: INSERT vào Sales_Order + Sales_Order_Item
   * @param {Object} data - { user, customerId, items, shippingAddress, paymentMethod, subtotal, discount, tax, shippingFee, total, status }
   * @returns {Order}
   */
  static async create(data) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Resolve customer_id từ mongo user ID
      let customerId = data.customerId || null;
      if (!customerId && data.user) {
        const mongoUserId = String(data.user);
        const custRes = await transaction.request()
          .input('mongoId', mongoUserId)
          .query(`SELECT customer_id FROM oltp.Customer WHERE email = (
            SELECT TOP 1 email FROM oltp.Customer WHERE email IS NOT NULL ORDER BY customer_id DESC
          )`);
        
        // Tìm customer theo email match — fallback: dùng customer_id = 1
        // Thực tế sẽ tìm qua email sync từ MongoDB
        const custByEmail = await transaction.request()
          .input('mongoId', mongoUserId)
          .query(`SELECT TOP 1 customer_id FROM oltp.Customer ORDER BY customer_id DESC`);
        
        if (custByEmail.recordset.length > 0) {
          customerId = custByEmail.recordset[0].customer_id;
        } else {
          customerId = 1; // fallback
        }
      }

      // Lấy trường address từ object shippingAddress (nếu có), hoặc dùng trực tiếp nếu là string
      let shippingAddrStr = null;
      if (data.shippingAddress) {
        if (typeof data.shippingAddress === 'object') {
          shippingAddrStr = data.shippingAddress.address || JSON.stringify(data.shippingAddress);
        } else {
          shippingAddrStr = data.shippingAddress;
        }
      }

      // INSERT Sales_Order
      const orderRes = await transaction.request()
        .input('customerId',    sql.Int,            customerId)
        .input('orderStatus',   sql.NVarChar(50),   data.status || 'Pending')
        .input('totalAmount',   sql.Decimal(18, 2), Number(data.total || 0))
        .input('shippingAddr',  sql.NVarChar(sql.MAX), shippingAddrStr)
        .query(`
          INSERT INTO oltp.Sales_Order (customer_id, order_status, total_amount, shipping_address)
          OUTPUT INSERTED.order_id, INSERTED.order_date
          VALUES (@customerId, @orderStatus, @totalAmount, @shippingAddr)
        `);

      const newOrderId = orderRes.recordset[0].order_id;
      const orderDate  = orderRes.recordset[0].order_date;

      // INSERT Sales_Order_Item cho từng item
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          const bookId    = hexIdToInt(item.product || item.bookId || item.book_id);
          const quantity  = Number(item.quantity || 1);
          const unitPrice = Number(item.price || item.unit_price || 0);
          const discountAmt = Number(item.discount_amount || 0);

          await transaction.request()
            .input('orderId',    sql.Int,            newOrderId)
            .input('bookId',     sql.Int,            bookId)
            .input('quantity',   sql.Int,            quantity)
            .input('unitPrice',  sql.Decimal(18, 2), unitPrice)
            .input('discountAmt', sql.Decimal(18, 2), discountAmt)
            .query(`
              INSERT INTO oltp.Sales_Order_Item (order_id, book_id, quantity, unit_price, discount_amount)
              VALUES (@orderId, @bookId, @quantity, @unitPrice, @discountAmt)
            `);
        }
      }

      await transaction.commit();

      // Return the created order
      return Order.findById(intToHexId(newOrderId));
    } catch (error) {
      await transaction.rollback();
      console.error('[Order.create] Error creating order:', error.message);
      throw new Error(`Tạo đơn hàng thất bại: ${error.message}`);
    }
    }

    next();
  } catch (error) {
    next(error);
>>>>>>> origin/dong
  }

<<<<<<< HEAD
  // ─── Static: findById ───────────────────────────────────────────────────────

  static async findById(id) {
    try {
      const pool = await getPool();
      const dbId = hexIdToInt(id);
      if (!dbId) return null;

      // Lấy order
      const orderRes = await pool.request()
        .input('id', dbId)
        .query(`SELECT * FROM oltp.Sales_Order WHERE order_id = @id`);

      if (orderRes.recordset.length === 0) return null;
      const row = orderRes.recordset[0];

      // Lấy items + join Book info
      const itemsRes = await pool.request()
        .input('oid', dbId)
        .query(`
          SELECT oi.book_id, oi.quantity, oi.unit_price, oi.discount_amount, oi.line_total,
                 b.title, b.selling_price, b.image_url
          FROM oltp.Sales_Order_Item oi
          LEFT JOIN oltp.Book b ON b.book_id = oi.book_id
          WHERE oi.order_id = @oid
        `);

      // Populate items with Book objects
      const items = itemsRes.recordset.map(ir => ({
        product: new Book({
          book_id: ir.book_id,
          title: ir.title,
          selling_price: ir.selling_price,
          image_url: ir.image_url
        }, false),
        title:    ir.title || '',
        image:    ir.image_url || '',
        price:    Number(ir.unit_price),
        quantity: Number(ir.quantity)
      }));

      // Lấy customer info
      let user = null;
      if (row.customer_id) {
        const userRes = await pool.request()
          .input('cid', row.customer_id)
          .query(`SELECT * FROM oltp.Customer WHERE customer_id = @cid`);
        if (userRes.recordset.length > 0) {
          const c = userRes.recordset[0];
          user = {
            _id:   intToHexId(c.customer_id),
            id:    intToHexId(c.customer_id),
            name:  c.full_name,
            email: c.email,
            phone: c.phone
          };
        }
      }

      return new Order(row, items, user, false);
    } catch (error) {
      console.error(`[Order.findById] Error fetching order by ID (${id}):`, error.message);
      throw new Error(`Tìm đơn hàng theo ID thất bại: ${error.message}`);
    }
  }

  // ─── Static: find ───────────────────────────────────────────────────────────

  /** find() trả về QueryChain (hỗ trợ .skip .limit .sort .populate) */
  static find(query) {
    return new QueryChain(Order, query);
  }

  // ─── Static: countDocuments ─────────────────────────────────────────────────

  static async countDocuments(query) {
    try {
      const pool = await getPool();

      if (!query || Object.keys(query).length === 0) {
        const result = await pool.request()
          .query(`SELECT COUNT(*) AS count FROM oltp.Sales_Order`);
        return result.recordset[0].count;
      }

      // Build WHERE clause cho các query đơn giản
      const req = pool.request();
      const conditions = [];
      let paramIdx = 0;

      for (const [key, value] of Object.entries(query)) {
        paramIdx++;
        const paramName = `p_${paramIdx}`;

        if (key === 'status' || key === 'order_status') {
          if (value && typeof value === 'object' && '$ne' in value) {
            req.input(paramName, value.$ne);
            conditions.push(`order_status != @${paramName}`);
          } else {
            req.input(paramName, value);
            conditions.push(`order_status = @${paramName}`);
          }
        } else if (key === 'createdAt' || key === 'order_date') {
          if (value && typeof value === 'object') {
            if ('$gte' in value) {
              paramIdx++;
              const p = `p_${paramIdx}`;
              req.input(p, value.$gte);
              conditions.push(`order_date >= @${p}`);
            }
            if ('$lte' in value) {
              paramIdx++;
              const p = `p_${paramIdx}`;
              req.input(p, value.$lte);
              conditions.push(`order_date <= @${p}`);
            }
          }
        } else if (key === 'user' || key === 'customer_id') {
          req.input(paramName, hexIdToInt(value) || value);
          conditions.push(`customer_id = @${paramName}`);
        }
      }

      const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
      const result = await req.query(`SELECT COUNT(*) AS count FROM oltp.Sales_Order WHERE ${where}`);
      return result.recordset[0].count;
    } catch (error) {
      console.error('[Order.countDocuments] Error:', error.message);
      throw new Error(`Đếm số lượng đơn hàng thất bại: ${error.message}`);
    }
  }

  // ─── Static: findByIdAndUpdate ──────────────────────────────────────────────

  static async findByIdAndUpdate(id, updateDoc) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);
    if (!dbId) return null;

    try {
      const req = pool.request().input('id', dbId);
      const sets = [];

      // Handle direct field updates
      const updateData = updateDoc.$set || updateDoc;

      if ('status' in updateData || 'order_status' in updateData) {
        const status = updateData.status || updateData.order_status;
        req.input('status', status);
        sets.push('order_status = @status');
      }

      if ('total' in updateData || 'total_amount' in updateData) {
        const total = updateData.total || updateData.total_amount;
        req.input('total', Number(total));
        sets.push('total_amount = @total');
      }

      if ('isPaid' in updateData || 'is_paid' in updateData) {
        const isPaid = updateData.isPaid || updateData.is_paid;
        req.input('isPaid', isPaid ? 1 : 0);
        sets.push('is_paid = @isPaid');
      }

      if ('shipping_address' in updateData || 'shippingAddress' in updateData) {
        const addr = updateData.shipping_address || updateData.shippingAddress;
        let addrStr = '';
        if (typeof addr === 'object' && addr !== null) {
          addrStr = addr.address || JSON.stringify(addr);
        } else {
          addrStr = String(addr || '');
        }
        req.input('shippingAddr', addrStr);
        sets.push('shipping_address = @shippingAddr');
      }

      if (sets.length === 0) return Order.findById(id);

      await req.query(`UPDATE oltp.Sales_Order SET ${sets.join(', ')} WHERE order_id = @id`);
      return Order.findById(id);
    } catch (error) {
      console.error(`[Order.findByIdAndUpdate] Error updating order ID (${id}):`, error.message);
      throw new Error(`Cập nhật đơn hàng thất bại: ${error.message}`);
    }
  }

  // ─── Instance: save ─────────────────────────────────────────────────────────

  async save() {
    if (this.isNew) {
      // Delegate to static create
      const created = await Order.create({
        customerId:     this.customerId,
        user:           this.user,
        items:          this.items,
        shippingAddress: this.shippingAddress,
        paymentMethod:  this.paymentMethod,
        subtotal:       this.subtotal,
        discount:       this.discount,
        tax:            this.tax,
        shippingFee:    this.shippingFee,
        total:          this.total,
        status:         this.status
      });
      Object.assign(this, created);
      return this;
    }

    // Update existing order
    const updated = await Order.findByIdAndUpdate(this._id, {
      status:          this.status,
      total:           this.total,
      isPaid:          this.isPaid,
      shippingAddress: this.shippingAddress
    });
    Object.assign(this, updated);
    return this;
  }

  // ─── Instance: populateProducts ─────────────────────────────────────────────

  async populateProducts() {
    if (this.items && this.items.length > 0 && this.items[0].product) {
      return this; // Already populated
    }

    // Re-fetch with populated items
    const full = await Order.findById(this._id);
    if (full) {
      this.items = full.items;
      this.user  = full.user;
    }
    return this;
  }

  toString() { return this._id; }
}

module.exports = Order;