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
const connectMongoDB = require('./backend/config/mongo.js');

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
const Cart = require('./backend/models/Cart');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const BACKEND_API_URL = 'http://localhost:5050';

const getBackendHeaders = (admin) => {
  const token = jwt.sign(
    { id: admin._id },
    process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345',
    { expiresIn: '10m' }
  );
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Multer: upload ảnh bìa sách ──────────────────────────────────────────────
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads', 'covers');
    if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `cover_${Date.now()}${ext}`);
  }
});
const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ cho phép ảnh JPEG, PNG, WebP hoặc GIF.'));
  }
});


app.use(session({
  secret: 'admin_secret_key',
  resave: false,
  saveUninitialized: false
}));

// Setup global variable for views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  res.locals.searchQuery = req.query.search ? req.query.search.trim() : '';
  next();
});

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
<<<<<<< HEAD
    
    // Set max price limit to 9,000,000 as requested
    const maxPriceLimit = 9000000;
    const maxPrice = req.query.maxPrice ? parseInt(req.query.maxPrice, 10) : maxPriceLimit;
    
=======
    const maxPrice = parseInt(req.query.maxPrice, 10) || 1000000;
>>>>>>> origin/dong
    const sortBy = req.query.sort || 'default';
    const genreQuery = req.query.genre;
    let selectedGenres = [];

    if (genreQuery) {
      selectedGenres = Array.isArray(genreQuery) ? genreQuery : [genreQuery];
    }

<<<<<<< HEAD
    // Publisher filter query
    const publisherQuery = req.query.publisher;
    let selectedPublishers = [];
    if (publisherQuery) {
      selectedPublishers = Array.isArray(publisherQuery) ? publisherQuery : [publisherQuery];
    }

=======
>>>>>>> origin/dong
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
<<<<<<< HEAD
    if (selectedPublishers.length > 0) {
      query.publisher = { $in: selectedPublishers };
    }
=======
>>>>>>> origin/dong

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

<<<<<<< HEAD
    const [totalBooks, availableGenres, availablePublishers] = await Promise.all([
      Book.countDocuments(query),
      Book.getGenres(),
      Book.getPublishers()
    ]);
=======
    const totalBooks = await Book.countDocuments(query);
>>>>>>> origin/dong
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
<<<<<<< HEAD
      maxPriceLimit,
      selectedGenres,
      selectedPublishers,
      sortBy,
      availableGenres,
      availablePublishers
=======
      selectedGenres,
      sortBy
>>>>>>> origin/dong
    });
  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
<<<<<<< HEAD
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

const requireUser = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
};

app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/account');
  res.render('login', { title: 'Đăng nhập', activePage: 'login', error: null, redirectUrl: req.query.redirect || '' });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password, redirectUrl } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render('login', { title: 'Đăng nhập', activePage: 'login', error: 'Email hoặc mật khẩu không đúng', redirectUrl });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.render('login', { title: 'Đăng nhập', activePage: 'login', error: 'Email hoặc mật khẩu không đúng', redirectUrl });
    
    req.session.user = { id: user._id, email: user.email, name: user.name };
    const redirectTo = redirectUrl || '/account';
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { title: 'Đăng nhập', activePage: 'login', error: 'Lỗi hệ thống', redirectUrl: req.body.redirectUrl || '' });
  }
});

app.get('/register', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/account');
  res.render('register', { title: 'Đăng ký', activePage: 'register', error: null });
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirm_password } = req.body;
    if (password !== confirm_password) return res.render('register', { title: 'Đăng ký', activePage: 'register', error: 'Mật khẩu không khớp' });
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.render('register', { title: 'Đăng ký', activePage: 'register', error: 'Email đã được sử dụng' });
    
    await User.create({ name, email, password, role: 'customer' });
    res.redirect('/login');
  } catch (error) {
    console.error('Register error:', error);
    // Lấy thông báo lỗi validation của Mongoose (vd: minlength, required...)
    let errorMessage = 'Lỗi hệ thống, vui lòng thử lại';
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      errorMessage = messages.join(', ');
    }
    res.render('register', { title: 'Đăng ký', activePage: 'register', error: errorMessage });
  }
});

app.post('/account/update', requireUser, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    // Validate tối thiểu
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Tên quá ngắn.' });
    }

    const updated = await User.findByIdAndUpdate(
      req.session.user.id,
      { $set: { name: name.trim(), phone: phone?.trim() || null, address: address?.trim() || null } },
      { new: true, runValidators: false }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });

    // Cập nhật tên trong session
    req.session.user.name = updated.name;

    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ============ CART API SYNC ============

// Lấy giỏ hàng từ MongoDB
app.get('/api/cart', requireUser, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.session.user.id });
    if (!cart) {
      cart = new Cart({ user: req.session.user.id, items: [] });
      await cart.save();
    }
    const populated = await cart.populateProducts();
    const cartData = populated.items
      .filter(item => item.product !== null) // Lọc sách bị xóa
      .map(item => ({
        id: item.product._id || item.product.id,
        title: item.product.title,
        price: item.product.selling_price || item.product.price,
        coverImage: item.product.image_url || item.product.coverImage,
        author: item.product.author_name || item.product.author || '',
        quantity: item.quantity
      }));
    res.json({ success: true, cart: cartData });
  } catch (error) {
    console.error('Get cart error:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi tải giỏ hàng.' });
  }
});

// Cập nhật giỏ hàng lên MongoDB
app.post('/api/cart/update', requireUser, async (req, res) => {
  try {
    const { cart: clientCart } = req.body;
    let cart = await Cart.findOne({ user: req.session.user.id });
    if (!cart) {
      cart = new Cart({ user: req.session.user.id, items: [] });
    }
    
    // Lọc các sản phẩm hợp lệ
    cart.items = (clientCart || [])
      .filter(item => item && item.id && item.quantity > 0)
      .map(item => ({
        product: item.id,
        quantity: item.quantity
      }));
      
    await cart.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Update cart error:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi đồng bộ giỏ hàng.' });
  }
});


app.get('/cart', requireUser, (req, res) => {
  res.render('cart', { title: 'Giỏ hàng', activePage: 'cart' });
});

app.get('/checkout', requireUser, async (req, res) => {
  try {
    const userDoc = await User.findById(req.session.user.id).lean();
    res.render('checkout', { title: 'Thanh toán', activePage: 'cart', userDoc: userDoc || {} });
  } catch (error) {
    console.error('Checkout error:', error.message);
    res.render('checkout', { title: 'Thanh toán', activePage: 'cart', userDoc: {} });
  }
});

// Map giá trị payment từ frontend sang enum của Order model
const PAYMENT_MAP = { cod: 'COD', bank: 'BANKING', wallet: 'MOMO' };

app.post('/orders', requireUser, async (req, res) => {
  try {
    const { customer, items, subtotal, shipping, tax, total, paymentMethod } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Giỏ hàng trống.' });
    }

    // Map items từ cart sang order schema
    const orderItems = items.map(item => ({
      product: item.id,          // hex ID của Book (SQL Server)
      title:   item.title,
      image:   item.coverImage || '',
      price:   item.price,
      quantity: item.quantity
    }));

    // Lấy customer_id từ SQL Server dựa trên email user MongoDB
    const mongoUser = await User.findById(req.session.user.id);
    let customerId = null;
    if (mongoUser && mongoUser.getCustomerId) {
      customerId = await mongoUser.getCustomerId();
    }

    // Tạo đơn hàng mới trong SQL Server
    const order = await Order.create({
      customerId,
      user: req.session.user.id,
      items: orderItems,
      shippingAddress: {
        fullName: customer.name,
        phone:    customer.phone,
        email:    customer.email,
        address:  customer.address
      },
      paymentMethod: PAYMENT_MAP[paymentMethod] || 'COD',
      subtotal: subtotal || 0,
      shippingFee: shipping || 0,
      tax:      tax || 0,
      total:    total || 0,
      status:   'Pending'
    });

    const orderId = 'ORD-' + new Date().getFullYear() + '-' + (order.orderId || Math.floor(1000 + Math.random() * 9000));

    res.json({ success: true, orderId, _id: order._id });
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tạo đơn hàng: ' + error.message });
  }
});

app.get('/account', requireUser, async (req, res) => {
  try {
    const userDoc = await User.findById(req.session.user.id).lean();
    
    // Lấy customer_id từ email user MongoDB
    const mongoUser = await User.findById(req.session.user.id);
    let customerId = null;
    if (mongoUser && mongoUser.getCustomerId) {
      customerId = await mongoUser.getCustomerId();
    }
    
    let orders = [];
    if (customerId) {
      // Lấy danh sách đơn hàng của khách hàng này từ SQL Server
      const rawOrders = await Order.find({ customer_id: customerId }).sort({ createdAt: -1 });
      
      // Populate thông tin sách cho mỗi đơn hàng
      for (const ord of rawOrders) {
        await ord.populateProducts();
        
        // Format mã đơn hàng tương thích với định dạng ORD-[năm]-[orderId]
        const year = ord.createdAt ? new Date(ord.createdAt).getFullYear() : new Date().getFullYear();
        const orderIdStr = 'ORD-' + year + '-' + ord.orderId;
        
        orders.push({
          orderId: orderIdStr,
          createdAt: ord.createdAt,
          total: ord.total,
          subtotal: ord.subtotal,
          shipping: ord.shippingFee,
          tax: ord.tax,
          paymentMethod: ord.paymentMethod,
          status: ord.status,
          customer: {
            name: userDoc.name,
            phone: userDoc.phone || '',
            email: userDoc.email,
            address: ord.shippingAddress ? (ord.shippingAddress.address || ord.shippingAddress || '') : ''
          },
          items: ord.items.map(item => ({
            coverImage: item.image || '/images/default-book.jpg',
            title: item.title,
            price: item.price,
            quantity: item.quantity
          }))
        });
      }
    }

    res.render('account', { 
      title: 'Tài khoản', 
      activePage: 'account', 
      userDoc: userDoc || {},
      orders: orders 
    });
  } catch (error) {
    console.error('Account error:', error.message);
    res.render('account', { 
      title: 'Tài khoản', 
      activePage: 'account', 
      userDoc: {},
      orders: [] 
    });
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

  res.render('cart', { title: 'Giỏ hàng', activePage: 'cart' });
});

app.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'Thanh toán', activePage: 'cart' });
});

app.get('/account', (req, res) => {
  res.render('account', { title: 'Tài khoản', activePage: 'account' });
>>>>>>> origin/dong
});

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
};

app.post('/admin/upload-cover', requireAdmin, (req, res) => {
  coverUpload.single('coverImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có tệp tin nào được tải lên.' });
    }
    const fileUrl = `/uploads/covers/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
});

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
      if (admin.isBlocked) {
        return res.render('admin/login', {
          title: 'Đăng nhập Quản trị',
          error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên hệ thống.'
        });
      }
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
    
    // Revenue today — dùng SQL query trực tiếp
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
    // Tạo adminToken để client-side gọi trực tiếp backend API
    const token = jwt.sign(
      { id: req.session.admin._id },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345',
      { expiresIn: '1h' }
    );

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
      statuses,
      adminToken: token,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Error loading admin books:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/book-form', requireAdmin, (req, res) => {
  const token = jwt.sign(
    { id: req.session.admin._id },
    process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345',
    { expiresIn: '1h' }
  );
  res.render('admin/book-form', {
    title: 'Thêm sách mới',
    activePage: 'books',
    admin: req.session.admin,
    book: null,
    adminToken: token,
    errors: []
  });
});

app.get('/admin/books/:id/edit', requireAdmin, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.redirect('/admin/books?error=' + encodeURIComponent('Không tìm thấy sách.'));

    const token = jwt.sign(
      { id: req.session.admin._id },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345',
      { expiresIn: '1h' }
    );
    res.render('admin/book-form', {
      title: 'Sửa sách',
      activePage: 'books',
      admin: req.session.admin,
      book,
      adminToken: token,
      errors: []
    });
  } catch (error) {
    console.error('Error loading edit form:', error.message);
    res.status(500).send('Lỗi máy chủ.');
  }
});

app.get('/admin/promotions', requireAdmin, (req, res) => {
  res.render('admin/promotions', { title: 'Quản lý khuyến mãi', activePage: 'promotions', admin: req.session.admin });
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
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
    const { q = '', status = 'all' } = req.query;
    
    // Generate adminToken for the client-side to communicate directly with backend
    const token = jwt.sign(
      { id: req.session.admin._id },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345',
      { expiresIn: '1h' }
    );

    const response = await fetch(`${BACKEND_API_URL}/api/users?q=${encodeURIComponent(q)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Lỗi từ phía backend API.');
    }
    
    let { users, stats } = await response.json();

    // Apply status filter client-side
    if (status === 'active') {
      users = users.filter(u => !u.isBlocked);
    } else if (status === 'inactive') {
      users = users.filter(u => u.isBlocked);
    }

    res.render('admin/customers', {
      title: 'Quản lý khách hàng',
      activePage: 'customers',
      admin: req.session.admin,
      customers: users,
      totalCustomersCount: stats.totalCustomersCount,
      blockedCustomersCount: stats.blockedCustomersCount,
      totalRevenue: stats.totalRevenue,
      searchQuery: q,
      statusFilter: status,
      adminToken: token,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Error loading customers:', error.message);
    res.render('admin/customers', {
      title: 'Quản lý khách hàng',
      activePage: 'customers',
      admin: req.session.admin,
      customers: [],
      totalCustomersCount: 0,
      blockedCustomersCount: 0,
      totalRevenue: 0,
      searchQuery: req.query.q || '',
      statusFilter: req.query.status || 'all',
      adminToken: '',
      error: 'Lỗi tải danh sách khách hàng: ' + error.message,
      success: null
    });
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
