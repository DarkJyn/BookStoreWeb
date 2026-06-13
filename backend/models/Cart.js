/**
 * Model: Cart
 * Bảng chính : oltp.Carts     (id varchar, customerId int, createdAt, updatedAt)
 * Bảng phụ  : oltp.CartItems  (id varchar, cartId varchar, bookId int, quantity, createdAt, updatedAt)
 *
 * Lưu ý: Carts dùng id kiểu varchar (generateId()), CartItems.bookId là int
 */
const { getPool, generateId, intToHexId, hexIdToInt } = require('../config/db');
const Product = require('./Product');

class Cart {
  constructor(row, items = []) {
    this._id    = row.id;
    this.id     = row.id;
    this.user   = intToHexId(row.customerId || row.customer_id);
    this.userId = this.user;
    this.items  = items;
    this.createdAt = row.createdAt || row.created_at;
    this.updatedAt = row.updatedAt || row.updated_at;
  }

  // Populate product details cho mỗi item (nếu chưa load)
  async populate(path) {
    if (path === 'items.product') {
      for (let i = 0; i < this.items.length; i++) {
        if (typeof this.items[i].product === 'string') {
          this.items[i].product = await Product.findById(this.items[i].product);
        }
      }
    }
    return this;
  }

  // ─── Static Finders ──────────────────────────────────────────────────────────

  /** Tìm giỏ hàng theo user hex-id */
  static async findOne(query) {
    const pool       = await getPool();
    const customerId = hexIdToInt(query.user || query.userId || query.customerId);

    const result = await pool.request()
      .input('cid', customerId)
      .query('SELECT * FROM oltp.Carts WHERE customerId = @cid');

    if (result.recordset.length === 0) return null;
    const row = result.recordset[0];

    // Load cart items + book info
    const itemsRes = await pool.request()
      .input('cartId', row.id)
      .query(`
        SELECT ci.id, ci.bookId, ci.quantity,
               b.title, b.selling_price AS price, b.image_url,
               COALESCE(inv.stock_quantity, 0) AS stock_quantity
        FROM oltp.CartItems ci
        LEFT JOIN oltp.Book      b   ON b.book_id    = ci.bookId
        LEFT JOIN oltp.Inventory inv ON inv.book_id  = ci.bookId
        WHERE ci.cartId = @cartId
      `);

    const bookIds = itemsRes.recordset.map(r => r.bookId);
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

    const items = itemsRes.recordset.map(ir => ({
      product: new Product({
        book_id:        ir.bookId,
        title:          ir.title,
        selling_price:  ir.price,
        image_url:      ir.image_url,
        stock_quantity: ir.stock_quantity,
        author:         (authorsMap[ir.bookId] || []).join(', '),
        genre:          (categoriesMap[ir.bookId] || [])[0] || 'Khác'
      }, false),
      quantity: Number(ir.quantity)
    }));

    return new Cart(row, items);
  }

  /** Tạo giỏ hàng mới cho user */
  static async create(payload) {
    const pool       = await getPool();
    const id         = generateId();
    const customerId = hexIdToInt(payload.user || payload.userId || payload.customerId);

    await pool.request()
      .input('id',  id)
      .input('cid', customerId)
      .query('INSERT INTO oltp.Carts (id, customerId, createdAt, updatedAt) VALUES (@id, @cid, GETDATE(), GETDATE())');

    return new Cart({ id, customerId, createdAt: new Date(), updatedAt: new Date() }, []);
  }

  // ─── Instance Save ────────────────────────────────────────────────────────────

  /** Lưu giỏ hàng: xóa CartItems cũ, insert lại từ this.items */
  async save() {
    const pool = await getPool();

    // Xóa toàn bộ items cũ
    await pool.request()
      .input('cartId', this._id)
      .query('DELETE FROM oltp.CartItems WHERE cartId = @cartId');

    // Insert items mới
    for (const item of this.items) {
      const itemId = generateId();
      const bookId = hexIdToInt(
        (item.product && typeof item.product === 'object') ? item.product._id : item.product
      );

      await pool.request()
        .input('id',     itemId)
        .input('cartId', this._id)
        .input('bookId', bookId)
        .input('qty',    item.quantity)
        .query(`
          INSERT INTO oltp.CartItems (id, cartId, bookId, quantity, createdAt, updatedAt)
          VALUES (@id, @cartId, @bookId, @qty, GETDATE(), GETDATE())
        `);
    }

    // Cập nhật updatedAt của cart
    await pool.request()
      .input('cartId', this._id)
      .query('UPDATE oltp.Carts SET updatedAt = GETDATE() WHERE id = @cartId');

    this.updatedAt = new Date();
    return this;
  }

  toString() { return this._id; }
}

module.exports = Cart;
