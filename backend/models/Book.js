/**
 * Model: Book
 * Bảng chính : oltp.Book         (book_id, title, selling_price, old_price, image_url,
 *                                  publisher_id, supplier_id, publish_year, cover_type,
 *                                  description, created_at, ...)
 * Join        : oltp.Inventory    (inventory_id, book_id, stock_quantity, last_updated)
 *             : oltp.Publisher    (publisher_id, publisher_name)
 *             : oltp.Book_Author  → oltp.Author  (author_id, author_name)
 *             : oltp.Book_Category → oltp.Category (category_id, category_name)
 */
const {
  sql,
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

/** Lấy danh sách tác giả & thể loại theo danh sách book_id sử dụng Parameterized Query */
const fetchAuthorsAndCategories = async (poolOrTx, bookIds) => {
  if (!bookIds || bookIds.length === 0) return { authorsMap: {}, categoriesMap: {} };

  // Đảm bảo lọc sạch các ID hợp lệ dạng số để tránh bất kỳ nguy cơ SQL Injection
  const cleanIds = bookIds.map(id => Number(id)).filter(id => !isNaN(id));
  if (cleanIds.length === 0) return { authorsMap: {}, categoriesMap: {} };

  const authorsMap = {};
  const categoriesMap = {};
  
  // Chia nhỏ danh sách IDs thành từng nhóm (chunk) tối đa 1000 phần tử để tránh giới hạn tham số của SQL Server
  const chunkSize = 1000;
  for (let i = 0; i < cleanIds.length; i += chunkSize) {
    const chunk = cleanIds.slice(i, i + chunkSize);
    const requestAuth = poolOrTx.request();
    const requestCat = poolOrTx.request();

    chunk.forEach((id, index) => {
      requestAuth.input(`id_${index}`, id);
      requestCat.input(`id_${index}`, id);
    });

    const paramPlaceholders = chunk.map((_, index) => `@id_${index}`).join(',');

    const [authRes, catRes] = await Promise.all([
      requestAuth.query(`
        SELECT ba.book_id, a.author_name
        FROM oltp.Book_Author ba
        JOIN oltp.Author a ON a.author_id = ba.author_id
        WHERE ba.book_id IN (${paramPlaceholders})
      `),
      requestCat.query(`
        SELECT bc.book_id, c.category_name
        FROM oltp.Book_Category bc
        JOIN oltp.Category c ON c.category_id = bc.category_id
        WHERE bc.book_id IN (${paramPlaceholders})
      `)
    ]);

    authRes.recordset.forEach(r => {
      if (!authorsMap[r.book_id]) authorsMap[r.book_id] = [];
      authorsMap[r.book_id].push(r.author_name);
    });

    catRes.recordset.forEach(r => {
      if (!categoriesMap[r.book_id]) categoriesMap[r.book_id] = [];
      categoriesMap[r.book_id].push(r.category_name);
    });
  }

  return { authorsMap, categoriesMap };
};

// ─── Class ────────────────────────────────────────────────────────────────────

class Book {
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

  // ─── Static Finders (Các hàm tìm kiếm dữ liệu - Read) ──────────────────────────

  /**
   * [READ] Giả lập Mongoose find() 
   * Trả về đối tượng QueryChain để hỗ trợ lọc, phân trang bằng cách nối đuôi phương thức (.skip, .limit, .sort)
   */
  static find(query) {
    return new QueryChain(Book, query);
  }

  /**
   * [READ] Tìm một cuốn sách duy nhất theo Hex ID
   * @param {string} id - Hex ID từ MongoDB hoặc Client gửi lên (ví dụ: '00000001')
   */
  static async findById(id) {
    try {
      const pool  = await getPool();
      // Chuyển Hex ID (chuỗi) sang số nguyên int để truy vấn trong SQL Server
      const dbId  = hexIdToInt(id);
      if (!dbId) return null;

      // Truy vấn thông tin sách kết hợp thông tin kho và nhà xuất bản (Left Join)
      const result = await pool.request()
        .input('id', dbId)
        .query(`${BOOK_SELECT} WHERE b.book_id = @id`);

      if (result.recordset.length === 0) return null;
      const row = result.recordset[0];

      // Lấy danh sách các tác giả và thể loại tương ứng từ bảng quan hệ Book_Author và Book_Category
      const { authorsMap, categoriesMap } = await fetchAuthorsAndCategories(pool, [dbId]);
      row.author = (authorsMap[dbId] || []).join(', ');
      row.genre  = (categoriesMap[dbId] || [])[0] || 'Khác';

      // Trả về thực thể Book mới được khởi tạo từ dòng dữ liệu SQL
      return new Book(row, false);
    } catch (error) {
      console.error(`[Book.findById] Error fetching book by ID (${id}):`, error.message);
      throw new Error(`Tìm sách theo ID thất bại: ${error.message}`);
    }
  }

  /**
   * [READ] Tìm kiếm sách theo từ khóa tiêu đề (LIKE %keyword%)
   */
  static async searchByTitle(keyword) {
    try {
      const pool = await getPool();

      // Sử dụng Parameterized Query với từ khóa LIKE để chống SQL Injection
      const result = await pool.request()
        .input('keyword', `%${keyword}%`)
        .query(`
          ${BOOK_SELECT}
          WHERE b.title LIKE @keyword
          ORDER BY b.title
        `);

      const bookIds = result.recordset.map(r => r.book_id);
      // Gom nhóm và truy vấn tác giả + thể loại cho toàn bộ danh sách kết quả trả về
      const { authorsMap, categoriesMap } = await fetchAuthorsAndCategories(pool, bookIds);

      return result.recordset.map(row => {
        row.author = (authorsMap[row.book_id] || []).join(', ');
        row.genre = (categoriesMap[row.book_id] || [])[0] || 'Khác';
        return new Book(row, false);
      });
    } catch (error) {
      console.error('[Book.searchByTitle] Error searching books:', error.message);
      throw new Error(`Tìm kiếm sách theo tên thất bại: ${error.message}`);
    }
  }

  /** Đếm số lượng sách theo điều kiện */
  static async countDocuments(query) {
    try {
      const pool  = await getPool();
      const req   = pool.request();
      const hasAuthor = queryHasField(query, 'author');
      const hasGenre  = queryHasField(query, 'genre') || queryHasField(query, 'category_name');

      let joins = `
        LEFT JOIN oltp.Inventory i ON i.book_id = b.book_id
        LEFT JOIN oltp.Publisher p ON p.publisher_id = b.publisher_id`;
      if (hasAuthor) joins += `
        LEFT JOIN oltp.Book_Author ba ON ba.book_id = b.book_id
        LEFT JOIN oltp.Author a       ON a.author_id = ba.author_id`;
      if (hasGenre) joins += `
        LEFT JOIN oltp.Book_Category bc ON bc.book_id = b.book_id
        LEFT JOIN oltp.Category c       ON c.category_id = bc.category_id`;

      const where = parseMongoQuery(query, req, Book);

      const result = await req.query(`
        SELECT COUNT(DISTINCT b.book_id) AS count
        FROM oltp.Book b
        ${joins}
        WHERE ${where}
      `);
      return result.recordset[0].count;
    } catch (error) {
      console.error('[Book.countDocuments] Error counting documents:', error.message);
      throw new Error(`Đếm số lượng sách thất bại: ${error.message}`);
    }
  }

  // ─── Mutations (Các hàm thay đổi dữ liệu - Delete/Update/Create) ─────────────────

  /**
   * [DELETE] Xóa sách theo hex ID sử dụng Database Transaction để đảm bảo tính nguyên tử
   * Xóa tất cả các liên kết khóa ngoại (Author, Category, Inventory) trước khi xóa dòng chính
   */
  static async findByIdAndDelete(id) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);
    if (!dbId) return;

    const transaction = new sql.Transaction(pool);
    try {
      // Bắt đầu một Transaction mới
      await transaction.begin();
      const req = transaction.request().input('id', dbId);

      // Bước 1: Xóa các bản ghi liên quan ở các bảng phụ (để tránh lỗi vi phạm ràng buộc khóa ngoại - Foreign Key Constraint)
      await req.query('DELETE FROM oltp.Book_Author   WHERE book_id = @id');
      await req.query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
      await req.query('DELETE FROM oltp.Inventory     WHERE book_id = @id');
      
      // Bước 2: Xóa dòng sách chính tại bảng Book
      await req.query('DELETE FROM oltp.Book          WHERE book_id = @id');

      // Xác nhận thành công và ghi nhận các thay đổi vào CSDL
      await transaction.commit();
    } catch (error) {
      // Quay lui (Rollback) toàn bộ nếu xảy ra lỗi ở bất kỳ bước nào
      await transaction.rollback();
      console.error(`[Book.findByIdAndDelete] Error deleting book ID (${id}):`, error.message);
      throw new Error(`Xóa sách theo ID thất bại: ${error.message}`);
    }
  }

  /**
   * [DELETE] Xóa một bản ghi theo query (Giả lập Mongoose deleteOne)
   */
  static async deleteOne(query) {
    const pool  = await getPool();
    const req   = pool.request();
    // Phân tích điều kiện lọc của Mongo sang câu lệnh SQL WHERE
    const where = parseMongoQuery(query, req, Book);

    // Tìm kiếm các book_id phù hợp với điều kiện lọc trước khi tiến hành xóa
    const found = await req.query(
      `SELECT DISTINCT b.book_id FROM oltp.Book b WHERE ${where}`
    );
    
    let deleted = 0;
    if (found.recordset.length === 0) return { deletedCount: 0 };

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      // Duyệt qua toàn bộ danh sách sách thỏa mãn để thực hiện xóa liên kết chéo
      for (const r of found.recordset) {
        const dbId = r.book_id;
        const txReq = transaction.request().input('id', dbId);
        
        await txReq.query('DELETE FROM oltp.Book_Author   WHERE book_id = @id');
        await txReq.query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
        await txReq.query('DELETE FROM oltp.Inventory     WHERE book_id = @id');
        await txReq.query('DELETE FROM oltp.Book          WHERE book_id = @id');
        deleted++;
      }

      await transaction.commit();
      return { deletedCount: deleted };
    } catch (error) {
      await transaction.rollback();
      console.error('[Book.deleteOne] Error deleting book:', error.message);
      throw new Error(`Xóa sách thất bại: ${error.message}`);
    }
  }

  /**
   * [UPDATE] Cập nhật 1 hoặc nhiều trường dữ liệu của sách, hoặc tăng/giảm số lượng tồn kho ($inc)
   * Sử dụng Database Transaction để đồng bộ hóa cập nhật trên cả oltp.Book và oltp.Inventory
   */
  static async findByIdAndUpdate(id, updateDoc) {
    const pool = await getPool();
    const dbId = hexIdToInt(id);
    if (!dbId) return null;

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      // Trường hợp cập nhật tăng / giảm số lượng tồn kho (thường gọi khi khách hàng đặt hàng thành công)
      if (updateDoc.$inc) {
        for (const [field, val] of Object.entries(updateDoc.$inc)) {
          if (field === 'stock') {
            await transaction.request()
               .input('id', dbId).input('v', val)
               .query('UPDATE oltp.Inventory SET stock_quantity = stock_quantity + @v WHERE book_id = @id');
          }
        }
        await transaction.commit();
        return this.findById(id);
      }

      // Kiểm tra dữ liệu đầu vào cơ bản nếu có cập nhật tiêu đề sách
      if ('title' in updateDoc && !updateDoc.title?.trim()) {
        throw new Error('Tên sách không được để trống.');
      }

      // Định nghĩa bản đồ ánh xạ giữa cột CSDL SQL Server và các alias thuộc tính từ Client
      const bookFields = { 
        title: 'title', 
        selling_price: 'price', 
        old_price: 'originalPrice',
        image_url: 'coverImage', 
        publish_year: 'year', 
        cover_type: 'format',
        description: 'description' 
      };

      const bookSets = [];
      const reqBook = transaction.request().input('id', dbId);
      let hasBookUpdates = false;

      // Duyệt qua bản đồ ánh xạ để chuẩn bị câu lệnh SQL UPDATE động cho bảng Book
      for (const [col, alias] of Object.entries(bookFields)) {
        if (alias in updateDoc || col in updateDoc) {
          let val = updateDoc[alias] ?? updateDoc[col];
          // Kiểm tra tính hợp lệ của giá bán & giá gốc
          if (col === 'selling_price' || col === 'old_price') {
            if (val !== null && (isNaN(Number(val)) || Number(val) < 0)) {
              throw new Error('Giá tiền phải là số lớn hơn hoặc bằng 0.');
            }
          }
          // Chuẩn hóa mô tả từ dạng mảng (Array) sang chuỗi xuống dòng (String với \n)
          if (col === 'description') {
            val = Array.isArray(val) ? val.join('\n') : String(val || '');
          }
          reqBook.input(`upd_${col}`, val);
          bookSets.push(`${col} = @upd_${col}`);
          hasBookUpdates = true;
        }
      }

      // Thực thi cập nhật bảng oltp.Book nếu có thay đổi trường tương ứng
      if (hasBookUpdates) {
        await reqBook.query(`UPDATE oltp.Book SET ${bookSets.join(', ')} WHERE book_id = @id`);
      }

      // Cập nhật số lượng tồn kho trong bảng oltp.Inventory nếu có truyền trường stock
      if ('stock' in updateDoc) {
        const stockVal = Number(updateDoc.stock);
        if (isNaN(stockVal) || stockVal < 0) {
          throw new Error('Tồn kho phải là số nguyên lớn hơn hoặc bằng 0.');
        }
        await transaction.request()
          .input('id', dbId)
          .input('upd_stock', stockVal)
          .query(`UPDATE oltp.Inventory SET stock_quantity = @upd_stock WHERE book_id = @id`);
      }

      await transaction.commit();
      return this.findById(id);
    } catch (error) {
      await transaction.rollback();
      console.error(`[Book.findByIdAndUpdate] Error updating book ID (${id}):`, error.message);
      throw new Error(`Cập nhật thông tin sách thất bại: ${error.message}`);
    }
  }

  // ─── Instance Save (Phương thức lưu/cập nhật thực thể - Create/Update) ──────────

  /**
   * [CREATE / UPDATE] Lưu hoặc cập nhật sách hiện tại (được bọc trong Database Transaction)
   * Đồng bộ hóa dữ liệu trên 5 bảng liên quan: Publisher, Book, Inventory, Book_Author, Book_Category
   */
  async save() {
    // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào trước khi insert/update
    if (!this.title?.trim()) {
      throw new Error('Tên sách là bắt buộc và không được để trống.');
    }
    if (this.price !== null && (isNaN(Number(this.price)) || Number(this.price) < 0)) {
      throw new Error('Giá bán phải là số lớn hơn hoặc bằng 0.');
    }
    if (this.originalPrice !== null && (isNaN(Number(this.originalPrice)) || Number(this.originalPrice) < 0)) {
      throw new Error('Giá gốc phải là số lớn hơn hoặc bằng 0.');
    }
    if (this.stock !== null && (isNaN(Number(this.stock)) || Number(this.stock) < 0)) {
      throw new Error('Số lượng tồn kho phải là số nguyên lớn hơn hoặc bằng 0.');
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      // Bắt đầu một Transaction để đảm bảo nếu một bảng lỗi thì toàn bộ thay đổi sẽ bị thu hồi
      await transaction.begin();
      const descStr = this._parseDescription(this.description).join('\n');

      // Bước 1: Xử lý thông tin Nhà Xuất Bản (Publisher)
      let publisherId = null;
      if (this.publisher) {
        const pubTrimmed = this.publisher.trim();
        // Kiểm tra xem tên nhà xuất bản đã tồn tại trong DB chưa
        const r = await transaction.request()
          .input('name', pubTrimmed)
          .query('SELECT publisher_id FROM oltp.Publisher WHERE publisher_name = @name');
        if (r.recordset.length > 0) {
          publisherId = r.recordset[0].publisher_id;
        } else {
          // Nếu chưa có, tiến hành chèn mới và lấy ID trả về
          const ins = await transaction.request()
            .input('name', pubTrimmed)
            .query('INSERT INTO oltp.Publisher (publisher_name) OUTPUT INSERTED.publisher_id VALUES (@name)');
          publisherId = ins.recordset[0].publisher_id;
        }
      }

      // Bước 2: Insert hoặc Update thông tin sách chính vào bảng oltp.Book
      if (!this.isNew && this._id) {
        // [UPDATE] Nếu là sách đã tồn tại (isNew = false)
        const dbId = hexIdToInt(this._id);
        await transaction.request()
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
        // [CREATE] Nếu là sách mới hoàn toàn
        const ins = await transaction.request()
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
        // Chuyển ID số nguyên SQL Server thành Hex ID để thống nhất định danh kiểu MongoDB
        this._id = intToHexId(newId);
        this.id  = this._id;
      }

      const dbId = hexIdToInt(this._id);

      // Bước 3: Đồng bộ số lượng tồn kho vào bảng oltp.Inventory
      const invChk = await transaction.request()
        .input('id', dbId)
        .query('SELECT 1 FROM oltp.Inventory WHERE book_id = @id');
      if (invChk.recordset.length > 0) {
        // Cập nhật tồn kho nếu đã tồn tại dòng bản ghi
        await transaction.request()
          .input('id',    dbId)
          .input('stock', this.stock || 0)
          .query('UPDATE oltp.Inventory SET stock_quantity = @stock, last_updated = GETDATE() WHERE book_id = @id');
      } else {
        // Chèn mới bản ghi tồn kho
        await transaction.request()
          .input('id',    dbId)
          .input('stock', this.stock || 0)
          .query('INSERT INTO oltp.Inventory (book_id, stock_quantity, last_updated) VALUES (@id, @stock, GETDATE())');
      }

      // Bước 4: Đồng bộ liên kết tác giả (Authors)
      // Xóa liên kết tác giả cũ của cuốn sách này để tránh trùng lặp
      await transaction.request().input('id', dbId).query('DELETE FROM oltp.Book_Author WHERE book_id = @id');
      // Tách chuỗi danh sách tác giả cách nhau bởi dấu phẩy hoặc chấm phẩy
      const authorNames = (this.author || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
      for (const name of authorNames) {
        let authorId;
        // Kiểm tra xem tác giả đã tồn tại trong CSDL chưa
        const ar = await transaction.request()
          .input('name', name)
          .query('SELECT author_id FROM oltp.Author WHERE author_name = @name');
        if (ar.recordset.length > 0) {
          authorId = ar.recordset[0].author_id;
        } else {
          // Tạo mới tác giả nếu chưa có
          const ai = await transaction.request()
            .input('name', name)
            .query('INSERT INTO oltp.Author (author_name) OUTPUT INSERTED.author_id VALUES (@name)');
          authorId = ai.recordset[0].author_id;
        }
        // Thêm liên kết quan hệ nhiều-nhiều vào bảng trung gian oltp.Book_Author
        await transaction.request()
          .input('bid', dbId).input('aid', authorId)
          .query('INSERT INTO oltp.Book_Author (book_id, author_id) VALUES (@bid, @aid)');
      }

      // Bước 5: Đồng bộ liên kết thể loại (Categories)
      // Xóa liên kết thể loại cũ
      await transaction.request().input('id', dbId).query('DELETE FROM oltp.Book_Category WHERE book_id = @id');
      const genres = Array.isArray(this.genre) ? this.genre : [this.genre];
      for (const name of genres.map(s => s.trim()).filter(Boolean)) {
        let categoryId;
        // Kiểm tra xem thể loại đã tồn tại chưa
        const cr = await transaction.request()
          .input('name', name)
          .query('SELECT category_id FROM oltp.Category WHERE category_name = @name');
        if (cr.recordset.length > 0) {
          categoryId = cr.recordset[0].category_id;
        } else {
          // Tạo mới thể loại
          const ci = await transaction.request()
            .input('name', name)
            .query('INSERT INTO oltp.Category (category_name) OUTPUT INSERTED.category_id VALUES (@name)');
          categoryId = ci.recordset[0].category_id;
        }
        // Thêm liên kết quan hệ nhiều-nhiều vào bảng trung gian oltp.Book_Category
        await transaction.request()
          .input('bid', dbId).input('cid', categoryId)
          .query('INSERT INTO oltp.Book_Category (book_id, category_id) VALUES (@bid, @cid)');
      }

      // Xác nhận hoàn thành và áp dụng mọi thay đổi vào CSDL SQL Server
      await transaction.commit();

      this.isNew     = false;
      this.createdAt = this.createdAt || new Date();
      this.updatedAt = new Date();
      return this;
    } catch (error) {
      // Hủy bỏ toàn bộ các thay đổi nếu có bất kỳ lỗi nào xảy ra trong quá trình ghi
      await transaction.rollback();
      console.error('[Book.save] Error saving book, transaction rolled back:', error.message);
      throw new Error(`Lưu thông tin sách thất bại: ${error.message}`);
    }
  }

  /** Lấy danh sách thể loại từ DB */
  static async getGenres() {
    try {
      const pool = await getPool();
      const result = await pool.query('SELECT category_name FROM oltp.Category ORDER BY category_name');
      return result.recordset.map(r => r.category_name).filter(Boolean);
    } catch (error) {
      console.error('[Book.getGenres] Error fetching genres:', error.message);
      return [];
    }
  }

  toString() { return this._id; }
}

module.exports = Book;
