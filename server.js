const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

const app = express();
const PORT = 3000;

// Connect to SQL Server & MongoDB
const { connectDB } = require('./backend/config/db');
const connectMongoDB = require('./backend/config/mongoDB');

connectDB()
  .then(() => console.log('🔌 Frontend server connected to SQL Server'))
  .catch(err => console.error('❌ SQL Server Connection Error in Frontend:', err.message));

connectMongoDB()
  .then(() => console.log('🔌 Frontend server connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error in Frontend:', err.message));


// Import Models & bcryptjs
const Book = require('./backend/models/Book');
const Order = require('./backend/models/Order');
const User = require('./backend/models/User');
const bcrypt = require('bcryptjs');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'admin_secret_key',
  resave: false,
  saveUninitialized: false
}));

const readJson = (filePath, fallback = []) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const getBooks = () => readJson(BOOKS_FILE, []);
const saveBooks = (books) => writeJson(BOOKS_FILE, books);
const getUsers = () => readJson(USERS_FILE, []);

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildBookPayload = (body, existing = {}) => ({
  ...existing,
  title: body.title?.trim() || existing.title || '',
  author: body.author?.trim() || existing.author || '',
  price: toNumberOrNull(body.price) ?? existing.price ?? 0,
  originalPrice: toNumberOrNull(body.originalPrice),
  coverImage: body.coverImage?.trim() || existing.coverImage || 'https://placehold.co/300x400?text=Book+Cover',
  imageAlt: body.imageAlt?.trim() || body.title?.trim() || existing.imageAlt || 'Book cover',
  genre: body.genre?.trim() || existing.genre || 'Khac',
  rating: toNumberOrNull(body.rating) ?? existing.rating ?? 4,
  stockStatus: body.stockStatus?.trim() || existing.stockStatus || 'In stock',
  publisher: body.publisher?.trim() || existing.publisher || '',
  year: toNumberOrNull(body.year) ?? existing.year ?? new Date().getFullYear(),
  format: body.format?.trim() || existing.format || '',
  stock: toNumberOrNull(body.stock) ?? existing.stock ?? 0,
  importPrice: toNumberOrNull(body.importPrice),
  shelfLocation: body.shelfLocation?.trim() || existing.shelfLocation || '',
  description: body.description
    ? body.description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : existing.description || []
});

app.use((req, res, next) => {
  res.locals.formatPrice = (price) => {
    if (price === null || price === undefined) return '';
    return `${new Intl.NumberFormat('vi-VN').format(price)} d`;
  };
  next();
});

app.get('/', async (req, res) => {
  try {
    const books = await Book.find().limit(4);
    res.render('index', { title: 'Trang chủ', activePage: 'home', books });
  } catch (error) {
    console.error('Error fetching home books:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 12;
    const searchQuery = req.query.search ? req.query.search.trim() : '';
    const authorQuery = req.query.author ? req.query.author.trim() : '';
    const maxPrice = parseInt(req.query.maxPrice, 10) || 1000000;
    const sortBy = req.query.sort || 'default';
    const genreQuery = req.query.genre;
    let selectedGenres = [];

    if (genreQuery) {
      selectedGenres = Array.isArray(genreQuery) ? genreQuery : [genreQuery];
    }

    let query = {};
    if (searchQuery) {
      query.title = { $regex: searchQuery, $options: 'i' };
    }
    if (authorQuery) {
      query.author = { $regex: authorQuery, $options: 'i' };
    }
    if (maxPrice) {
      query.price = { $lte: maxPrice };
    }
    if (selectedGenres.length > 0) {
      query.genre = { $in: selectedGenres };
    }

    let sortOptions = {};
    switch (sortBy) {
      case 'price_asc':
        sortOptions = { price: 1 };
        break;
      case 'price_desc':
        sortOptions = { price: -1 };
        break;
      case 'bestselling':
        sortOptions = { soldCount: -1 };
        break;
      case 'rating':
        sortOptions = { rating: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:  // 'default' hoặc chưa chọn: sắp theo book_id tăng dần (sách thật từ import trước)
        sortOptions = { id: 1 };
        break;
    }

    const totalBooks = await Book.countDocuments(query);
    const totalPages = Math.ceil(totalBooks / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (safePage - 1) * limit;

    const books = await Book.find(query)
      .skip(startIndex)
      .limit(limit)
      .sort(sortOptions);

    res.render('products', {
      title: 'Danh sách sách',
      activePage: 'browse',
      books,
      currentPage: safePage,
      totalPages,
      totalBooks,
      startIndex,
      endIndex: startIndex + books.length,
      searchQuery,
      authorQuery,
      maxPrice,
      selectedGenres,
      sortBy
    });
  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send('Không tìm thấy sách.');

    const relatedBooks = await Book.find({ _id: { $ne: book._id } }).limit(4);

    res.render('product-detail', {
      title: book.title,
      activePage: 'browse',
      book,
      relatedBooks
    });
  } catch (error) {
    console.error('Error fetching product detail:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/cart', (req, res) => {
  res.render('cart', { title: 'Giỏ hàng', activePage: 'cart' });
});

app.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'Thanh toán', activePage: 'cart' });
});

app.get('/account', (req, res) => {
  res.render('account', { title: 'Tài khoản', activePage: 'account' });
});

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
};

app.get('/admin', requireAdmin, (req, res) => {
  res.redirect('/admin/dashboard');
});

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Đăng nhập Quản trị', error: null });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { username: email.trim() }
      ],
      role: 'admin'
    });

    if (admin) {
      const isMatch = await admin.comparePassword(password);
      if (isMatch) {
        req.session.admin = {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role
        };
        return res.redirect('/admin/dashboard');
      }
    }

    res.render('admin/login', {
      title: 'Đăng nhập Quản trị',
      error: 'Tài khoản hoặc mật khẩu không chính xác hoặc không có quyền quản trị.'
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.render('admin/login', {
      title: 'Đăng nhập Quản trị',
      error: 'Lỗi máy chủ cơ sở dữ liệu.'
    });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const totalBooks = await Book.countDocuments();
    const totalOrders = await Order.countDocuments();
    
    // Revenue today
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const endOfToday = new Date();
    endOfToday.setHours(23,59,59,999);
    
    const todayOrders = await Order.find({
      createdAt: { $gte: startOfToday, $lte: endOfToday },
      status: { $ne: 'Cancelled' }
    });
    const todayRevenue = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const lowStockCount = await Book.countDocuments({ stock: { $gt: 0, $lte: 5 } });

    res.render('admin/dashboard', {
      title: 'Bảng điều khiển',
      activePage: 'dashboard',
      admin: req.session.admin,
      totalBooks,
      totalOrders,
      todayRevenue,
      totalCustomers,
      lowStockCount
    });
  } catch (error) {
    console.error('Error loading admin dashboard:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/books', requireAdmin, async (req, res) => {
  try {
    const { q = '', genre = '', status = '', page = 1 } = req.query;
    let query = {};

    if (q.trim()) {
      const keyword = q.trim();
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { author: { $regex: keyword, $options: 'i' } },
        { publisher: { $regex: keyword, $options: 'i' } }
      ];
    }

    if (genre) {
      query.genre = genre;
    }

    if (status) {
      if (status === 'Out of stock') {
        query.stock = 0;
      } else if (status === 'Low stock') {
        query.stock = { $gt: 0, $lte: 5 };
      } else if (status === 'In stock') {
        query.stock = { $gt: 5 };
      }
    }

    const limit = 50;
    const totalBooks = await Book.countDocuments(query);
    const totalPages = Math.ceil(totalBooks / limit) || 1;
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
    const skip = (currentPage - 1) * limit;

    const books = await Book.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const genres = await Book.getGenres();
    const statuses = ['In stock', 'Low stock', 'Out of stock'];

    res.render('admin/books', {
      title: 'Quản lý sách',
      activePage: 'books',
      admin: req.session.admin,
      books,
      totalBooks,
      currentPage,
      totalPages,
      filters: { q, genre, status },
      genres,
      statuses
    });
  } catch (error) {
    console.error('Error loading admin books:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/book-form', requireAdmin, (req, res) => {
  res.render('admin/book-form', {
    title: 'Thêm sách',
    activePage: 'books',
    admin: req.session.admin,
    book: null,
    errors: []
  });
});

app.get('/admin/books/:id/edit', requireAdmin, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send('Không tìm thấy sách.');

    res.render('admin/book-form', {
      title: 'Sửa sách',
      activePage: 'books',
      admin: req.session.admin,
      book,
      errors: []
    });
  } catch (error) {
    console.error('Error loading edit form:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.post('/admin/books', requireAdmin, async (req, res) => {
  const errors = [];
  if (!req.body.title?.trim()) errors.push('Tên sách là bắt buộc');
  if (!req.body.author?.trim()) errors.push('Tác giả là bắt buộc');

  if (errors.length) {
    return res.status(400).render('admin/book-form', {
      title: 'Thêm sách',
      activePage: 'books',
      admin: req.session.admin,
      book: req.body,
      errors
    });
  }

  try {
    const payload = buildBookPayload(req.body);
    const book = new Book(payload);
    await book.save();
    res.redirect('/admin/books');
  } catch (error) {
    console.error('Error adding book:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.post('/admin/books/:id', requireAdmin, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send('Không tìm thấy sách.');

    const payload = buildBookPayload(req.body, book);
    Object.assign(book, payload);
    await book.save();
    res.redirect('/admin/books');
  } catch (error) {
    console.error('Error updating book:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.post('/admin/books/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.redirect('/admin/books');
  } catch (error) {
    console.error('Error deleting book:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/promotions', requireAdmin, (req, res) => {
  res.render('admin/promotions', { title: 'Quản lý khuyến mãi', activePage: 'promotions', admin: req.session.admin });
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find().populate('user').sort({ createdAt: -1 });
    res.render('admin/orders', {
      title: 'Quản lý đơn hàng',
      activePage: 'orders',
      admin: req.session.admin,
      orders
    });
  } catch (error) {
    console.error('Error loading orders:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.post('/admin/orders/:id/deliver', requireAdmin, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'Delivered' });
    res.redirect('/admin/orders');
  } catch (error) {
    console.error('Error delivering order:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.post('/admin/orders/:id/cancel', requireAdmin, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'Cancelled' });
    res.redirect('/admin/orders');
  } catch (error) {
    console.error('Error cancelling order:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/customers', requireAdmin, async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    res.render('admin/customers', {
      title: 'Quản lý khách hàng',
      activePage: 'customers',
      admin: req.session.admin,
      customers
    });
  } catch (error) {
    console.error('Error loading customers:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/inventory', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const totalBooks = await Book.countDocuments();
    const totalPages = Math.ceil(totalBooks / limit) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const skip = (currentPage - 1) * limit;

    const books = await Book.find()
      .sort({ stock: 1 })
      .skip(skip)
      .limit(limit);

    const outOfStockCount = await Book.countDocuments({ stock: 0 });
    const lowStockCount = await Book.countDocuments({ stock: { $gt: 0, $lte: 5 } });

    res.render('admin/inventory', {
      title: 'Quản lý tồn kho',
      activePage: 'inventory',
      admin: req.session.admin,
      books,
      totalBooks,
      currentPage,
      totalPages,
      outOfStockCount,
      lowStockCount
    });
  } catch (error) {
    console.error('Error loading inventory:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/import', requireAdmin, (req, res) => {
  res.render('admin/import', { title: 'Nhập hàng', activePage: 'import', admin: req.session.admin });
});

app.get('/admin/staff', requireAdmin, (req, res) => {
  res.render('admin/staff', { title: 'Quản lý nhân viên', activePage: 'staff', admin: req.session.admin });
});

app.get('/admin/reports', requireAdmin, (req, res) => {
  res.render('admin/reports', { title: 'Báo cáo thống kê', activePage: 'reports', admin: req.session.admin });
});

app.listen(PORT, () => {
  console.log(`Literary Hearth is running at http://localhost:${PORT}`);
});
