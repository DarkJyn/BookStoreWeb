/**
 * Model: Order
 * Bảng chính : oltp.Sales_Order      (order_id, customer_id, order_date, order_status,
 *                                      total_amount, fullName, phone, address, city,
 *                                      paymentMethod, subtotal, discount, tax, shippingFee, updatedAt)
 * Bảng phụ  : oltp.Sales_Order_Item  (order_item_id, order_id, book_id, quantity, unit_price)
 *             : oltp.Payment           (payment_id, order_id, payment_method, payment_status,
 *                                       paid_amount, payment_date)
 */
const { getPool, parseMongoQuery, QueryChain, intToHexId, hexIdToInt } = require('../config/db');
const User    = require('./User');
const Product = require('./Product');

class Order {
  constructor(row, items = [], user = null, isNew = true) {
    this.isNew = isNew;
    this._id   = intToHexId(row.order_id || row.id);
    this.id    = this._id;

    // User — nhận từ DB row (customer_id) hoặc JS payload (user / customerId)
    const rawCustId = row.customer_id || row.customerId || row.user;
    this.user   = user || (typeof rawCustId === 'number' ? intToHexId(rawCustId) : rawCustId) || null;
    this.userId = (this.user && typeof this.user === 'object')
      ? this.user._id
      : (this.user || null);

    // Items
    this.items = items || [];

    // Địa chỉ giao hàng
    if (row.shippingAddress && typeof row.shippingAddress === 'object') {
      this.shippingAddress = row.shippingAddress;
    } else {
      this.shippingAddress = {
        fullName: row.fullName  || null,
        phone:    row.phone     || null,
        address:  row.address   || null,
        city:     row.city      || null
      };
    }

    this.paymentMethod = row.paymentMethod || row.payment_method || null;
    this.subtotal      = Number(row.subtotal      || 0);
    this.discount      = Number(row.discount      || 0);
    this.tax           = Number(row.tax           || 0);
    this.shippingFee   = Number(row.shippingFee   || row.shipping_fee || 0);
    this.total         = Number(row.total_amount  || row.total        || 0);
    this.status        = row.order_status || row.status || 'Pending';
    this.createdAt     = row.order_date   || row.createdAt || null;
    this.updatedAt     = row.updatedAt    || row.order_date || null;
  }

  populate() { return this; }   // no-op (data đã được join khi load)

  // ─── Static Finders ──────────────────────────────────────────────────────────

  static find(query) {
    return new QueryChain(Order, query);
  }

  static async findById(id) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);

    const result = await pool.request()
      .input('id', dbId)
      .query('SELECT * FROM oltp.Sales_Order WHERE order_id = @id');

    if (result.recordset.length === 0) return null;
    const row = result.recordset[0];

    // Load user
    let user = null;
    if (row.customer_id) {
      const ur = await pool.request()
        .input('cid', row.customer_id)
        .query('SELECT * FROM oltp.Customer WHERE customer_id = @cid');
      if (ur.recordset.length > 0) user = new User(ur.recordset[0]);
    }

    // Load items
    const itemsResult = await pool.request()
      .input('oid', dbId)
      .query(`
        SELECT oi.book_id, oi.quantity, oi.unit_price,
               b.title, b.selling_price, b.image_url
        FROM oltp.Sales_Order_Item oi
        LEFT JOIN oltp.Book b ON b.book_id = oi.book_id
        WHERE oi.order_id = @oid
      `);

    const bookIds = itemsResult.recordset.map(r => r.book_id);
    let authorsMap = {}, categoriesMap = {};
    if (bookIds.length > 0) {
      const idList = bookIds.join(',');
      const [ar, cr] = await Promise.all([
        pool.request().query(`
          SELECT ba.book_id, a.author_name
          FROM oltp.Book_Author ba
          JOIN oltp.Author a ON a.author_id = ba.author_id
          WHERE ba.book_id IN (${idList})`),
        pool.request().query(`
          SELECT bc.book_id, c.category_name
          FROM oltp.Book_Category bc
          JOIN oltp.Category c ON c.category_id = bc.category_id
          WHERE bc.book_id IN (${idList})`)
      ]);
      ar.recordset.forEach(r => {
        if (!authorsMap[r.book_id]) authorsMap[r.book_id] = [];
        authorsMap[r.book_id].push(r.author_name);
      });
      cr.recordset.forEach(r => {
        if (!categoriesMap[r.book_id]) categoriesMap[r.book_id] = [];
        categoriesMap[r.book_id].push(r.category_name);
      });
    }

    const items = itemsResult.recordset.map(ir => ({
      product: new Product({
        book_id:       ir.book_id,
        title:         ir.title,
        author:        (authorsMap[ir.book_id] || []).join(', '),
        selling_price: ir.selling_price,
        image_url:     ir.image_url,
        genre:         (categoriesMap[ir.book_id] || [])[0] || 'Khác'
      }, false),
      quantity: Number(ir.quantity),
      price:    Number(ir.unit_price)
    }));

    return new Order(row, items, user, false);
  }

  static async countDocuments(query) {
    const pool  = await getPool();
    const req   = pool.request();
    const where = parseMongoQuery(query, req, Order);
    const result = await req.query(
      `SELECT COUNT(*) AS count FROM oltp.Sales_Order WHERE ${where}`
    );
    return result.recordset[0].count;
  }

  static async findByIdAndUpdate(id, updateDoc) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);
    if (updateDoc.status || updateDoc.order_status) {
      const status = updateDoc.status || updateDoc.order_status;
      await pool.request()
        .input('id',     dbId)
        .input('status', status)
        .query('UPDATE oltp.Sales_Order SET order_status = @status, updatedAt = GETDATE() WHERE order_id = @id');
    }
  }

  // ─── Instance Save ────────────────────────────────────────────────────────────

  async save() {
    const pool = await getPool();

    const custId = hexIdToInt(
      (this.user && typeof this.user === 'object') ? this.user._id : (this.user || this.userId)
    );

    if (!this.isNew && this._id) {
      // Cập nhật trạng thái
      const dbId = hexIdToInt(this._id);
      await pool.request()
        .input('id',     dbId)
        .input('status', this.status || 'Pending')
        .query('UPDATE oltp.Sales_Order SET order_status = @status, updatedAt = GETDATE() WHERE order_id = @id');
      this.updatedAt = new Date();
      return this;
    }

    // Insert đơn hàng mới
    const insRes = await pool.request()
      .input('custId',   custId || null)
      .input('fullName', this.shippingAddress?.fullName || null)
      .input('phone',    this.shippingAddress?.phone    || null)
      .input('address',  this.shippingAddress?.address  || null)
      .input('city',     this.shippingAddress?.city     || null)
      .input('payment',  this.paymentMethod             || null)
      .input('subtotal', this.subtotal   || 0)
      .input('discount', this.discount   || 0)
      .input('tax',      this.tax        || 0)
      .input('shipping', this.shippingFee || 0)
      .input('total',    this.total      || 0)
      .input('status',   this.status     || 'Pending')
      .query(`
        INSERT INTO oltp.Sales_Order
          (customer_id, fullName, phone, address, city, paymentMethod,
           subtotal, discount, tax, shippingFee, total_amount, order_status, order_date)
        OUTPUT INSERTED.order_id
        VALUES (@custId, @fullName, @phone, @address, @city, @payment,
                @subtotal, @discount, @tax, @shipping, @total, @status, GETDATE())
      `);

    const newOrderId = insRes.recordset[0].order_id;
    this._id = intToHexId(newOrderId);
    this.id  = this._id;

    // Insert Payment
    await pool.request()
      .input('oid',    newOrderId)
      .input('method', this.paymentMethod || 'COD')
      .input('amount', this.total || 0)
      .query(`
        INSERT INTO oltp.Payment (order_id, payment_method, paid_amount, payment_status, payment_date)
        VALUES (@oid, @method, @amount, 'Completed', GETDATE())
      `);

    // Insert Order Items
    for (const item of this.items) {
      const prodId = hexIdToInt(
        (item.product && typeof item.product === 'object') ? item.product._id : item.product
      );
      await pool.request()
        .input('oid',   newOrderId)
        .input('bid',   prodId)
        .input('qty',   item.quantity)
        .input('price', item.price || 0)
        .query(`
          INSERT INTO oltp.Sales_Order_Item (order_id, book_id, quantity, unit_price)
          VALUES (@oid, @bid, @qty, @price)
        `);
    }

    this.isNew     = false;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    return this;
  }

  toString() { return this._id; }
}

module.exports = Order;
