/**
 * Model: Product
 * Bảng chính : oltp.Book       (book_id, title, selling_price, old_price, image_url,
 *                                publisher_id, supplier_id, publish_year, cover_type,
 *                                description, created_at, ...)
 * Join        : oltp.Inventory  (inventory_id, book_id, stock_quantity, last_updated)
 *             : oltp.Publisher  (publisher_id, publisher_name)
 *             : oltp.Book_Author  → oltp.Author  (author_id, author_name)
 *             : oltp.Book_Category → oltp.Category (category_id, category_name)
 */
const {
  getPool,
  parseMongoQuery,
  QueryChain,
  intToHexId,
  hexIdToInt,
  queryHasField
} = require('../config/db');

// ─── SQL helpers ──────────────────────────────────────────────────────────────

/** SELECT cơ bản cho 1 cuốn sách (Book + Inventory + Publisher) */
const BOOK_SELECT = `
  SELECT
    b.book_id,
    b.title,
    b.description,
    b.selling_price,
    b.old_price,
    b.image_url,
    b.publish_year,
    b.cover_type,
    b.created_at,
    COALESCE(i.stock_quantity, 0) AS stock_quantity,
    p.publisher_name
  FROM oltp.Book b
  LEFT JOIN oltp.Inventory i ON i.book_id = b.book_id
  LEFT JOIN oltp.Publisher p ON p.publisher_id = b.publisher_id
`;

/** Lấy danh sách tác giả & thể loại theo danh sách book_id */
const fetchAuthorsAndCategories = async (pool, bookIds) => {
  if (!bookIds || bookIds.length === 0) return { authorsMap: {}, categoriesMap: {} };

  const idList = bookIds.join(',');

  const [authRes, catRes] = await Promise.all([
    pool.request().query(`
      SELECT ba.book_id, a.author_name
      FROM oltp.Book_Author ba
      JOIN oltp.Author a ON a.author_id = ba.author_id
      WHERE ba.book_id IN (${idList})
    `),
    pool.request().query(`
      SELECT bc.book_id, c.category_name
      FROM oltp.Book_Category bc
      JOIN oltp.Category c ON c.category_id = bc.category_id
      WHERE bc.book_id IN (${idList})
    `)
  ]);

  const authorsMap = {};
  authRes.recordset.forEach(r => {
    if (!authorsMap[r.book_id]) authorsMap[r.book_id] = [];
    authorsMap[r.book_id].push(r.author_name);
  });

  const categoriesMap = {};
  catRes.recordset.forEach(r => {
    if (!categoriesMap[r.book_id]) categoriesMap[r.book_id] = [];
    categoriesMap[r.book_id].push(r.category_name);
  });

  return { authorsMap, categoriesMap };
};

// ─── Class ────────────────────────────────────────────────────────────────────

class Product {
  constructor(row, isNew = true) {
    this.isNew = isNew;

    this._id  = intToHexId(row.book_id || row.id);
    this.id   = this._id;

    this.title         = row.title         || '';
    this.author        = row.author        || '';
    this.description   = this._parseDescription(row.description);
    this.selling_price = Number(row.selling_price || row.price || 0);
    this.price         = this.selling_price;           // alias dùng trong frontend
    this.old_price     = row.old_price != null ? Number(row.old_price) : null;
    this.originalPrice = this.old_price;
    this.image_url     = row.image_url     || row.coverImage || '';
    this.coverImage    = this.image_url;
    this.imageAlt      = row.imageAlt || row.title || '';
    this.publish_year  = row.publish_year  || row.year  || null;
    this.year          = this.publish_year;
    this.cover_type    = row.cover_type    || row.format || '';
    this.format        = this.cover_type;
    this.publisher     = row.publisher_name || row.publisher || '';
    this.genre         = row.genre         || row.category_name || 'Khác';
    this.rating        = Number(row.rating || 4);
    this.stock         = Number(row.stock_quantity != null ? row.stock_quantity : (row.stock || 0));
    this.stockStatus   = this.stock > 0 ? 'In stock' : 'Out of stock';
    this.soldCount     = Number(row.sold_qty || row.soldCount || 0);
    this.importPrice   = row.importPrice   != null ? Number(row.importPrice)   : null;
    this.shelfLocation = row.shelfLocation || null;
    this.createdAt     = row.created_at    || row.createdAt || null;
    this.updatedAt     = row.updatedAt     || row.created_at || null;
  }

  _parseDescription(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        if (raw.trim().startsWith('[')) return JSON.parse(raw);
      } catch (_) { /* ignore */ }
      return raw.split('\n').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  // ─── Static Finders ──────────────────────────────────────────────────────────

  /** find() trả về QueryChain (hỗ trợ .skip .limit .sort) */
  static find(query) {
    return new QueryChain(Product, query);
  }

  /** Tìm 1 sản phẩm theo hex ID */
  static async findById(id) {
    const pool  = await getPool();
    const dbId  = hexIdToInt(id);

    const result = await pool.request()
      .input('id', dbId)
      .query(`${BOOK_SELECT} WHERE b.book_id = @id`);

    if (result.recordset.length === 0) return null;
    const row = result.recordset[0];

    const { authorsMap, categoriesMap } = await fetchAuthorsAndCategories(pool, [dbId]);
    row.author = (authorsMap[dbId] || []).join(', ');
    row.genre  = (categoriesMap[dbId] || [])[0] || 'Khác';

    return new Product(row, false);
  }
  static async searchByTitle(keyword) {
  const pool = await getPool();

  const result = await pool.request()
    .input('keyword', `%${keyword}%`)
    .query(`
      ${BOOK_SELECT}
      WHERE b.title LIKE @keyword
      ORDER BY b.title
    `);

  const bookIds = result.recordset.map(r => r.book_id);

  const { authorsMap, categoriesMap } =
    await fetchAuthorsAndCategories(pool, bookIds);

  return result.recordset.map(row => {
    row.author = (authorsMap[row.book_id] || []).join(', ');
    row.genre = (categoriesMap[row.book_id] || [])[0] || 'Khác';
    return new Product(row, false);
  });
}
  /** Đếm số sản phẩm theo điều kiện */
  static async countDocuments(query) {
    const pool  = await getPool();
    const req   = pool.request();
    const hasAuthor = queryHasField(query, 'author');
    const hasGenre  = queryHasField(query, 'genre') || queryHasField(query, 'category_name');

    let joins = '';
    if (hasAuthor) joins += `
      LEFT JOIN oltp.Book_Author ba ON ba.book_id = b.book_id
      LEFT JOIN oltp.Author a       ON a.author_id = ba.author_id`;
    if (hasGenre) joins += `
      LEFT JOIN oltp.Book_Category bc ON bc.book_id = b.book_id
      LEFT JOIN oltp.Category c       ON c.category_id = bc.category_id`;

    const where = parseMongoQuery(query, req, Product);

    const result = await req.query(`
      SELECT COUNT(DISTINCT b.book_id) AS count
      FROM oltp.Book b
      ${joins}
      WHERE ${where}
    `);
    return result.recordset[0].count;
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  /** Xóa theo hex ID */
  static async findByIdAndDelete(id) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);
    // Xóa liên kết trước
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Author   WHERE book_id = @id');
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Inventory     WHERE book_id = @id');
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Book          WHERE book_id = @id');
  }

  /** Xóa 1 bản ghi theo query */
  static async deleteOne(query) {
    const pool  = await getPool();
    const req   = pool.request();
    const where = parseMongoQuery(query, req, Product);

    // Lấy book_id trước để xóa liên kết
    const found = await req.query(
      `SELECT DISTINCT b.book_id FROM oltp.Book b WHERE ${where}`
    );
    let deleted = 0;
    for (const r of found.recordset) {
      const dbId = r.book_id;
      await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Author   WHERE book_id = @id');
      await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
      await pool.request().input('id', dbId).query('DELETE FROM oltp.Inventory     WHERE book_id = @id');
      await pool.request().input('id', dbId).query('DELETE FROM oltp.Book          WHERE book_id = @id');
      deleted++;
    }
    return { deletedCount: deleted };
  }

  /** Cập nhật 1 trường / $inc */
  static async findByIdAndUpdate(id, updateDoc) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);

    if (updateDoc.$inc) {
      for (const [field, val] of Object.entries(updateDoc.$inc)) {
        if (field === 'stock') {
          await pool.request()
            .input('id', dbId).input('v', val)
            .query('UPDATE oltp.Inventory SET stock_quantity = stock_quantity + @v WHERE book_id = @id');
        }
        // soldCount không có cột tương ứng trong schema hiện tại → bỏ qua
      }
      return;
    }

    // Cập nhật trực tiếp
    const bookFields = { title: 'title', selling_price: 'price', old_price: 'originalPrice',
                         image_url: 'coverImage', publish_year: 'year', cover_type: 'format',
                         description: 'description' };
    const bookSets = [];
    const invSets  = [];

    for (const [col, alias] of Object.entries(bookFields)) {
      if (alias in updateDoc || col in updateDoc) {
        const val = updateDoc[alias] ?? updateDoc[col];
        pool.request().input(`upd_${col}`, val);
        bookSets.push(`${col} = @upd_${col}`);
      }
    }
    if ('stock' in updateDoc) {
      invSets.push('stock_quantity = @upd_stock');
    }

    if (bookSets.length > 0) {
      const req = pool.request().input('id', dbId);
      for (const [col, alias] of Object.entries(bookFields)) {
        if (alias in updateDoc || col in updateDoc) req.input(`upd_${col}`, updateDoc[alias] ?? updateDoc[col]);
      }
      await req.query(`UPDATE oltp.Book SET ${bookSets.join(', ')} WHERE book_id = @id`);
    }
    if (invSets.length > 0) {
      const req = pool.request().input('id', dbId).input('upd_stock', updateDoc.stock);
      await req.query(`UPDATE oltp.Inventory SET stock_quantity = @upd_stock WHERE book_id = @id`);
    }

    return this.findById(id);
  }

  // ─── Instance Save ────────────────────────────────────────────────────────────

  async save() {
    const pool    = await getPool();
    const descStr = this._parseDescription(this.description).join('\n');

    // 1. Resolve publisher
    let publisherId = null;
    if (this.publisher) {
      const r = await pool.request()
        .input('name', this.publisher.trim())
        .query('SELECT publisher_id FROM oltp.Publisher WHERE publisher_name = @name');
      if (r.recordset.length > 0) {
        publisherId = r.recordset[0].publisher_id;
      } else {
        const ins = await pool.request()
          .input('name', this.publisher.trim())
          .query('INSERT INTO oltp.Publisher (publisher_name) OUTPUT INSERTED.publisher_id VALUES (@name)');
        publisherId = ins.recordset[0].publisher_id;
      }
    }

    // 2. Insert hoặc Update Book
    if (!this.isNew && this._id) {
      const dbId = hexIdToInt(this._id);
      await pool.request()
        .input('id',          dbId)
        .input('title',       this.title)
        .input('price',       this.price)
        .input('oldPrice',    this.originalPrice)
        .input('image',       this.coverImage || '')
        .input('year',        this.year || new Date().getFullYear())
        .input('format',      this.format || '')
        .input('desc',        descStr)
        .input('pubId',       publisherId)
        .query(`
          UPDATE oltp.Book
          SET title         = @title,
              selling_price = @price,
              old_price     = @oldPrice,
              image_url     = @image,
              publish_year  = @year,
              cover_type    = @format,
              description   = @desc,
              publisher_id  = @pubId
          WHERE book_id = @id
        `);
    } else {
      const ins = await pool.request()
        .input('title',    this.title)
        .input('price',    this.price)
        .input('oldPrice', this.originalPrice)
        .input('image',    this.coverImage || '')
        .input('year',     this.year || new Date().getFullYear())
        .input('format',   this.format || '')
        .input('desc',     descStr)
        .input('pubId',    publisherId)
        .query(`
          INSERT INTO oltp.Book
            (title, selling_price, old_price, image_url, publish_year, cover_type, description, publisher_id, created_at)
          OUTPUT INSERTED.book_id
          VALUES (@title, @price, @oldPrice, @image, @year, @format, @desc, @pubId, GETDATE())
        `);
      const newId = ins.recordset[0].book_id;
      this._id = intToHexId(newId);
      this.id  = this._id;
    }

    const dbId = hexIdToInt(this._id);

    // 3. Upsert Inventory
    const invChk = await pool.request()
      .input('id', dbId)
      .query('SELECT 1 FROM oltp.Inventory WHERE book_id = @id');
    if (invChk.recordset.length > 0) {
      await pool.request()
        .input('id',    dbId)
        .input('stock', this.stock || 0)
        .query('UPDATE oltp.Inventory SET stock_quantity = @stock, last_updated = GETDATE() WHERE book_id = @id');
    } else {
      await pool.request()
        .input('id',    dbId)
        .input('stock', this.stock || 0)
        .query('INSERT INTO oltp.Inventory (book_id, stock_quantity, last_updated) VALUES (@id, @stock, GETDATE())');
    }

    // 4. Authors
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Author WHERE book_id = @id');
    const authorNames = (this.author || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    for (const name of authorNames) {
      let authorId;
      const ar = await pool.request()
        .input('name', name)
        .query('SELECT author_id FROM oltp.Author WHERE author_name = @name');
      if (ar.recordset.length > 0) {
        authorId = ar.recordset[0].author_id;
      } else {
        const ai = await pool.request()
          .input('name', name)
          .query('INSERT INTO oltp.Author (author_name) OUTPUT INSERTED.author_id VALUES (@name)');
        authorId = ai.recordset[0].author_id;
      }
      await pool.request()
        .input('bid', dbId).input('aid', authorId)
        .query('INSERT INTO oltp.Book_Author (book_id, author_id) VALUES (@bid, @aid)');
    }

    // 5. Categories
    await pool.request().input('id', dbId).query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
    const genres = Array.isArray(this.genre) ? this.genre : [this.genre];
    for (const name of genres.map(s => s.trim()).filter(Boolean)) {
      let categoryId;
      const cr = await pool.request()
        .input('name', name)
        .query('SELECT category_id FROM oltp.Category WHERE category_name = @name');
      if (cr.recordset.length > 0) {
        categoryId = cr.recordset[0].category_id;
      } else {
        const ci = await pool.request()
          .input('name', name)
          .query('INSERT INTO oltp.Category (category_name) OUTPUT INSERTED.category_id VALUES (@name)');
        categoryId = ci.recordset[0].category_id;
      }
      await pool.request()
        .input('bid', dbId).input('cid', categoryId)
        .query('INSERT INTO oltp.Book_Category (book_id, category_id) VALUES (@bid, @cid)');
    }

    this.isNew     = false;
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = new Date();
    return this;
  }

  toString() { return this._id; }
}

module.exports = Product;
