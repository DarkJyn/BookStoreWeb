/**
 * Model: User
 * Bảng: oltp.Customer
 * Cột: customer_id, full_name, email, phone, address, username, password, role, created_at
 */
const bcrypt = require('bcryptjs');
const { getPool, parseMongoQuery, QueryChain, intToHexId, hexIdToInt } = require('../config/db');

class User {
  constructor(row) {
    this._id = intToHexId(row.customer_id);
    this.id  = this._id;
    this.name     = row.full_name;
    this.email    = row.email;
    this.phone    = row.phone    || null;
    this.address  = row.address  || null;
    this.username = row.username || null;
    this.password = row.password;
    this.role     = row.role     || 'customer';
    this.createdAt = row.created_at;
  }

  // So sánh mật khẩu
  async comparePassword(enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
  }

  // ─── Static Methods ────────────────────────────────────────────────

  /**
   * Tìm user theo ID (hex → int)
   * Trả về Promise có thêm method .select()
   */
  static findById(id) {
    const promise = (async () => {
      const pool = await getPool();
      const result = await pool.request()
        .input('id', hexIdToInt(id))
        .query('SELECT * FROM oltp.Customer WHERE customer_id = @id');
      if (result.recordset.length === 0) return null;
      return new User(result.recordset[0]);
    })();

    promise.select = (fields) =>
      promise.then(user => {
        if (user && String(fields).includes('-password')) delete user.password;
        return user;
      });

    return promise;
  }

  /**
   * Tìm một user theo điều kiện Mongo-style
   * Trả về Promise có thêm method .select()
   */
  static findOne(query) {
    const promise = (async () => {
      const pool = await getPool();
      const req  = pool.request();
      const where = parseMongoQuery(query, req, User);
      const result = await req.query(
        `SELECT TOP 1 * FROM oltp.Customer WHERE ${where}`
      );
      if (result.recordset.length === 0) return null;
      return new User(result.recordset[0]);
    })();

    promise.select = (fields) =>
      promise.then(user => {
        if (user && String(fields).includes('-password')) delete user.password;
        return user;
      });

    return promise;
  }

  /**
   * Lấy danh sách users (hỗ trợ .sort(), .skip(), .limit())
   */
  static find(query) {
    return new QueryChain(User, query);
  }

  /**
   * Đếm số user theo điều kiện
   */
  static async countDocuments(query) {
    const pool = await getPool();
    const req  = pool.request();
    const where = parseMongoQuery(query, req, User);
    const result = await req.query(
      `SELECT COUNT(*) AS count FROM oltp.Customer WHERE ${where}`
    );
    return result.recordset[0].count;
  }

  /**
   * Tạo user mới (hash mật khẩu, insert vào DB)
   */
  static async create(payload) {
    const salt           = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(payload.password, salt);

    const pool = await getPool();
    const req  = pool.request();
    req.input('name',     payload.name);
    req.input('email',    payload.email.toLowerCase().trim());
    req.input('username', payload.username || null);
    req.input('password', hashedPassword);
    req.input('role',     payload.role || 'customer');

    const insRes = await req.query(`
      INSERT INTO oltp.Customer (full_name, email, username, password, role, created_at)
      OUTPUT INSERTED.customer_id
      VALUES (@name, @email, @username, @password, @role, GETDATE())
    `);

    const newId = intToHexId(insRes.recordset[0].customer_id);
    return new User({
      customer_id: insRes.recordset[0].customer_id,
      full_name:   payload.name,
      email:       payload.email,
      username:    payload.username || null,
      password:    hashedPassword,
      role:        payload.role || 'customer',
      created_at:  new Date()
    });
  }

  toString() { return this._id; }
}

module.exports = User;
