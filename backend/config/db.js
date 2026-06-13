/**
 * config/db.js
 * Kết nối SQL Server (BookSalesDW) và các helper tiện ích:
 *   - getPool()           : lấy connection pool
 *   - generateId()        : tạo varchar ID ngẫu nhiên (dành cho Carts/CartItems)
 *   - intToHexId(n)       : convert int PK → hex-string 24 ký tự (như ObjectId)
 *   - hexIdToInt(hex)     : convert hex-string → int PK
 *   - mapFieldName()      : map tên field JS → tên cột SQL
 *   - parseMongoQuery()   : chuyển Mongo-style query object → SQL WHERE clause
 *   - queryHasField()     : kiểm tra field tồn tại (đệ quy) trong query object
 *   - QueryChain          : builder hỗ trợ .skip/.limit/.sort cho Product, User, Order
 */

const sql    = require('mssql');
const crypto = require('crypto');

// ─── Connection ───────────────────────────────────────────────────────────────

const config = {
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server:   process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
  },
};

let poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('🔌 Connected to Microsoft SQL Server:', config.server);
    return pool;
  })
  .catch(err => {
    console.error('❌ SQL Server Connection Failed! Check credentials in .env:', err.message);
    throw err;
  });

const getPool = () => poolPromise;

// ─── ID Helpers ───────────────────────────────────────────────────────────────

/** Tạo varchar ID ngẫu nhiên (24 ký tự hex) dùng cho Carts / CartItems */
const generateId = () => crypto.randomBytes(12).toString('hex');

/** Convert INT primary key → hex string 24 ký tự (tương thích ObjectId) */
function intToHexId(id) {
  if (id === null || id === undefined) return null;
  const num = Number(id);
  if (isNaN(num)) return String(id);
  const hex = num.toString(16);
  return '000000000000000000000000'.slice(0, 24 - hex.length) + hex;
}

/** Convert hex string → INT primary key */
function hexIdToInt(hex) {
  if (!hex) return null;
  if (typeof hex === 'number') return hex;
  const h = String(hex).trim();
  if (/^[0-9a-fA-F]{1,24}$/.test(h)) {
    const n = parseInt(h, 16);
    if (!isNaN(n)) return n;
  }
  const n = Number(h);
  return isNaN(n) ? h : n;
}

// ─── Field Mapping (JS model property → SQL column) ──────────────────────────

/**
 * Ánh xạ tên field của model sang tên cột SQL.
 * Chỉ hỗ trợ schema BookSalesDW (oltp.*).
 */
const mapFieldName = (field, modelClass) => {
  const name = modelClass && modelClass.name;

  if (name === 'Book') {
    // Bảng b = oltp.Book, a = oltp.Author (join), c = oltp.Category (join), i = oltp.Inventory (join)
    switch (field) {
      case '_id':
      case 'id':          return 'b.book_id';
      case 'title':       return 'b.title';
      case 'price':
      case 'selling_price': return 'b.selling_price';
      case 'originalPrice':
      case 'old_price':   return 'b.old_price';
      case 'coverImage':
      case 'image_url':   return 'b.image_url';
      case 'year':
      case 'publish_year': return 'b.publish_year';
      case 'format':
      case 'cover_type':  return 'b.cover_type';
      case 'createdAt':
      case 'created_at':  return 'b.created_at';
      case 'author':
      case 'author_name': return 'a.author_name';
      case 'genre':
      case 'category_name': return 'c.category_name';
      case 'stock':
      case 'stock_quantity': return 'i.stock_quantity';
      default:            return `b.${field}`;
    }
  }

  if (name === 'User') {
    switch (field) {
      case '_id':
      case 'id':        return 'customer_id';
      case 'name':
      case 'full_name': return 'full_name';
      case 'email':     return 'email';
      case 'username':  return 'username';
      case 'password':  return 'password';
      case 'role':      return 'role';
      case 'createdAt':
      case 'created_at': return 'created_at';
      default:          return field;
    }
  }

  if (name === 'Order') {
    switch (field) {
      case '_id':
      case 'id':       return 'order_id';
      case 'user':
      case 'userId':
      case 'customerId': return 'customer_id';
      case 'status':
      case 'order_status': return 'order_status';
      case 'total':
      case 'total_amount': return 'total_amount';
      case 'createdAt':
      case 'order_date':  return 'order_date';
      default:         return field;
    }
  }

  if (name === 'Cart') {
    switch (field) {
      case '_id':
      case 'id':     return 'id';
      case 'user':
      case 'userId': return 'customerId';
      default:       return field;
    }
  }

  if (field === '_id') return 'id';
  return field;
};

// ─── queryHasField ────────────────────────────────────────────────────────────

/** Kiểm tra đệ quy xem query object có chứa field không */
const queryHasField = (obj, fieldName) => {
  if (!obj || typeof obj !== 'object') return false;
  if (fieldName in obj) return true;
  for (const val of Object.values(obj)) {
    if (typeof val === 'object' && queryHasField(val, fieldName)) return true;
  }
  return false;
};

// ─── parseMongoQuery ──────────────────────────────────────────────────────────

/**
 * Chuyển Mongo-style query object thành SQL WHERE clause.
 * Hỗ trợ: $or, $regex, $lte, $gte, $lt, $gt, $ne, $in, giá trị bình thường.
 */
const parseMongoQuery = (query, request, modelClass) => {
  if (!query || Object.keys(query).length === 0) return '1=1';

  const clauses = [];
  let counter   = 0;

  const addParam = (val) => {
    counter++;
    const name = `p_${counter}`;
    request.input(name, val);
    return `@${name}`;
  };

  const convertVal = (k, v) => {
    const isIdField = [
      '_id', 'id', 'user', 'userId', 'customerId', 'customer_id',
      'product', 'productId', 'bookId', 'book_id', 'cartId'
    ].includes(k);
    if (!isIdField) return v;
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(item => hexIdToInt(item));
    return hexIdToInt(v);
  };

  for (const [key, value] of Object.entries(query)) {
    const field = mapFieldName(key, modelClass);

    // $or
    if (key === '$or' && Array.isArray(value)) {
      const orParts = value.map(sub => {
        const subClauses = [];
        for (const [sk, sv] of Object.entries(sub)) {
          const sf = mapFieldName(sk, modelClass);
          if (sv && typeof sv === 'object' && '$regex' in sv) {
            subClauses.push(`${sf} LIKE ${addParam('%' + sv.$regex + '%')}`);
          } else {
            subClauses.push(`${sf} = ${addParam(convertVal(sk, sv))}`);
          }
        }
        return subClauses.length ? `(${subClauses.join(' AND ')})` : null;
      }).filter(Boolean);
      if (orParts.length) clauses.push(`(${orParts.join(' OR ')})`);
      continue;
    }

    // Giá trị object (operators)
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('$regex' in value) {
        clauses.push(`${field} LIKE ${addParam('%' + value.$regex + '%')}`);
      } else if ('$in' in value) {
        if (!value.$in.length) { clauses.push('1=0'); continue; }
        const params = value.$in.map(v => addParam(convertVal(key, v)));
        clauses.push(`${field} IN (${params.join(', ')})`);
      } else {
        const subClauses = [];
        if ('$gt'  in value) subClauses.push(`${field} >  ${addParam(convertVal(key, value.$gt))}`);
        if ('$gte' in value) subClauses.push(`${field} >= ${addParam(convertVal(key, value.$gte))}`);
        if ('$lt'  in value) subClauses.push(`${field} <  ${addParam(convertVal(key, value.$lt))}`);
        if ('$lte' in value) subClauses.push(`${field} <= ${addParam(convertVal(key, value.$lte))}`);
        if ('$ne'  in value) subClauses.push(`${field} != ${addParam(convertVal(key, value.$ne))}`);
        if (subClauses.length) clauses.push(`(${subClauses.join(' AND ')})`);
      }
    } else {
      // Giá trị literal
      clauses.push(`${field} = ${addParam(convertVal(key, value))}`);
    }
  }

  return clauses.length ? clauses.join(' AND ') : '1=1';
};

// ─── QueryChain ───────────────────────────────────────────────────────────────

class QueryChain {
  constructor(modelClass, mongoQuery) {
    this.modelClass  = modelClass;
    this.mongoQuery  = mongoQuery;
    this.skipVal     = null;
    this.limitVal    = null;
    this.sortVal     = null;
  }

  skip(val)  { this.skipVal  = val; return this; }
  limit(val) { this.limitVal = val; return this; }
  sort(val)  { this.sortVal  = val; return this; }
  populate() { return this; }   // no-op

  async execute() {
    const pool      = await getPool();
    const request   = pool.request();
    const where     = parseMongoQuery(this.mongoQuery, request, this.modelClass);
    const modelName = this.modelClass.name;

    let sqlQuery = '';

    // ── Book ─────────────────────────────────────────────────────────────
    if (modelName === 'Book') {
      const hasAuthor = queryHasField(this.mongoQuery, 'author');
      const hasGenre  = queryHasField(this.mongoQuery, 'genre') ||
                        queryHasField(this.mongoQuery, 'category_name');
      const distinct  = (hasAuthor || hasGenre) ? 'DISTINCT' : '';
      let joins = `
        LEFT JOIN oltp.Inventory i ON i.book_id = b.book_id
        LEFT JOIN oltp.Publisher p ON p.publisher_id = b.publisher_id\n`;
      if (hasAuthor) joins += `
        LEFT JOIN oltp.Book_Author ba ON ba.book_id = b.book_id
        LEFT JOIN oltp.Author a       ON a.author_id = ba.author_id`;
      if (hasGenre) joins += `
        LEFT JOIN oltp.Book_Category bc ON bc.book_id = b.book_id
        LEFT JOIN oltp.Category c       ON c.category_id = bc.category_id`;

      sqlQuery = `
        SELECT ${distinct}
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
          b.publisher_id
        FROM oltp.Book b
        ${joins}
        WHERE ${where}
      `;

    // ── User ─────────────────────────────────────────────────────────────────
    } else if (modelName === 'User') {
      sqlQuery = `SELECT * FROM oltp.Customer WHERE ${where}`;

    // ── Order ─────────────────────────────────────────────────────────────────
    } else if (modelName === 'Order') {
      sqlQuery = `SELECT * FROM oltp.Sales_Order WHERE ${where}`;

    } else {
      sqlQuery = `SELECT * FROM oltp.Carts WHERE ${where}`;
    }

    // ── ORDER BY ──────────────────────────────────────────────────────────────
    const defaultOrder = modelName === 'Book'    ? 'b.created_at' :
                         modelName === 'Order'   ? 'order_date'   : 'created_at';
    let orderBy = `ORDER BY ${defaultOrder} DESC`;

    if (this.sortVal) {
      const entries = typeof this.sortVal === 'string'
        ? [[this.sortVal.replace(/^-/, ''), this.sortVal.startsWith('-') ? -1 : 1]]
        : Object.entries(this.sortVal);

      const parts = entries.map(([f, d]) => {
        const col = mapFieldName(f, this.modelClass);
        return `${col} ${(d === -1 || d === 'desc' || d === 'DESC') ? 'DESC' : 'ASC'}`;
      });
      if (parts.length) orderBy = `ORDER BY ${parts.join(', ')}`;
    }
    sqlQuery += ` ${orderBy}`;

    // ── OFFSET / FETCH ────────────────────────────────────────────────────────
    if (this.skipVal !== null || this.limitVal !== null) {
      sqlQuery += ` OFFSET ${this.skipVal || 0} ROWS`;
      if (this.limitVal !== null) sqlQuery += ` FETCH NEXT ${this.limitVal} ROWS ONLY`;
    }

    const result = await request.query(sqlQuery);

    // ── Post-process Book ─────────────────────────────────────────────────────
    if (modelName === 'Book' && result.recordset.length > 0) {
      const Book = require('../models/Book');
      const bookIds = result.recordset.map(r => r.book_id);
      
      const cleanIds = bookIds.map(id => Number(id)).filter(id => !isNaN(id));
      let authorsMap = {}, categoriesMap = {};
      
      if (cleanIds.length > 0) {
        const requestAuth = pool.request();
        const requestCat = pool.request();
        cleanIds.forEach((id, index) => {
          requestAuth.input(`id_${index}`, id);
          requestCat.input(`id_${index}`, id);
        });
        const paramPlaceholders = cleanIds.map((_, index) => `@id_${index}`).join(',');

        const [ar, cr] = await Promise.all([
          requestAuth.query(`
            SELECT ba.book_id, a.author_name
            FROM oltp.Book_Author ba
            JOIN oltp.Author a ON a.author_id = ba.author_id
            WHERE ba.book_id IN (${paramPlaceholders})`),
          requestCat.query(`
            SELECT bc.book_id, c.category_name
            FROM oltp.Book_Category bc
            JOIN oltp.Category c ON c.category_id = bc.category_id
            WHERE bc.book_id IN (${paramPlaceholders})`)
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

      return result.recordset.map(row => {
        row.author = (authorsMap[row.book_id] || []).join(', ');
        row.genre  = (categoriesMap[row.book_id] || [])[0] || 'Khác';
        return new Book(row, false);
      });
    }

    // ── Post-process Order ────────────────────────────────────────────────────
    if (modelName === 'Order' && result.recordset.length > 0) {
      const Order   = require('../models/Order');
      const User    = require('../models/User');
      const Book    = require('../models/Book');
      const orders  = [];

      for (const row of result.recordset) {
        const orderId = row.order_id;

        // Load customer
        let user = null;
        if (row.customer_id) {
          const ur = await pool.request()
            .input('cid', row.customer_id)
            .query('SELECT * FROM oltp.Customer WHERE customer_id = @cid');
          if (ur.recordset.length > 0) user = new User(ur.recordset[0]);
        }

        // Load items
        const itemsRes = await pool.request()
          .input('oid', orderId)
          .query(`
            SELECT oi.book_id, oi.quantity, oi.unit_price,
                   b.title, b.selling_price, b.image_url
            FROM oltp.Sales_Order_Item oi
            LEFT JOIN oltp.Book b ON b.book_id = oi.book_id
            WHERE oi.order_id = @oid
          `);

        const bookIds = itemsRes.recordset.map(r => r.book_id);
        const cleanIds = bookIds.map(id => Number(id)).filter(id => !isNaN(id));
        let authorsMap = {}, categoriesMap = {};
        if (cleanIds.length) {
          const requestAuth = pool.request();
          const requestCat = pool.request();
          cleanIds.forEach((id, index) => {
            requestAuth.input(`id_${index}`, id);
            requestCat.input(`id_${index}`, id);
          });
          const paramPlaceholders = cleanIds.map((_, index) => `@id_${index}`).join(',');

          const [ar, cr] = await Promise.all([
            requestAuth.query(`SELECT ba.book_id, a.author_name FROM oltp.Book_Author ba JOIN oltp.Author a ON a.author_id=ba.author_id WHERE ba.book_id IN (${paramPlaceholders})`),
            requestCat.query(`SELECT bc.book_id, c.category_name FROM oltp.Book_Category bc JOIN oltp.Category c ON c.category_id=bc.category_id WHERE bc.book_id IN (${paramPlaceholders})`)
          ]);
          ar.recordset.forEach(r => { if (!authorsMap[r.book_id]) authorsMap[r.book_id]=[]; authorsMap[r.book_id].push(r.author_name); });
          cr.recordset.forEach(r => { if (!categoriesMap[r.book_id]) categoriesMap[r.book_id]=[]; categoriesMap[r.book_id].push(r.category_name); });
        }

        const items = itemsRes.recordset.map(ir => ({
          product: new Book({ book_id: ir.book_id, title: ir.title, selling_price: ir.selling_price, image_url: ir.image_url,
                               author: (authorsMap[ir.book_id]||[]).join(', '), genre: (categoriesMap[ir.book_id]||[])[0]||'Khác' }, false),
          quantity: Number(ir.quantity),
          price:    Number(ir.unit_price)
        }));

        orders.push(new Order(row, items, user, false));
      }
      return orders;
    }

    // ── Default map ───────────────────────────────────────────────────────────
    return result.recordset.map(row => new this.modelClass(row, false));
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
}

// ─── connectDB ────────────────────────────────────────────────────────────────

const connectDB = async () => {
  try {
    const pool = await getPool();
    // Kiểm tra bảng oltp.Customer tồn tại
    const check = await pool.request().query(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'oltp' AND TABLE_NAME = 'Customer'
    `);
    if (check.recordset[0].cnt === 0) {
      throw new Error('Không tìm thấy bảng oltp.Customer. Kiểm tra lại schema.');
    }
    console.log(`🔌 Connected to Microsoft SQL Server: ${config.server}. Schema: ${config.database} (oltp.*)`);
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sql,
  getPool,
  connectDB,
  generateId,
  intToHexId,
  hexIdToInt,
  mapFieldName,
  parseMongoQuery,
  queryHasField,
  QueryChain,
  // Backward-compat stub (luôn trả về true vì chỉ hỗ trợ BookSalesDW)
  isSalesDWDb: () => true,
};
