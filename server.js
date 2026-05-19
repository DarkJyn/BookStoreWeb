const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const books = require('./data/books.json');

// Global EJS helpers
app.use((req, res, next) => {
  res.locals.formatPrice = (price) => {
    if (price === null || price === undefined) return '';
    return new Intl.NumberFormat('vi-VN').format(price) + ' đ';
  };
  next();
});

// ============== ROUTES ==============

// Trang chủ
app.get('/', (req, res) => {
  const newArrivals = books.slice(0, 4);
  res.render('index', { title: 'Trang chủ', activePage: 'home', books: newArrivals });
});

// Danh sách sản phẩm
app.get('/products', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const authorQuery = req.query.author ? req.query.author.trim() : '';
  const maxPrice = parseInt(req.query.maxPrice) || 500000;

  // Parse selected genres
  const genreQuery = req.query.genre;
  let selectedGenres = [];
  if (genreQuery) {
    if (Array.isArray(genreQuery)) {
      selectedGenres = genreQuery;
    } else {
      selectedGenres = [genreQuery];
    }
  }

  let filteredBooks = books;
  if (authorQuery) {
    filteredBooks = books.filter(book => 
      book.author.toLowerCase().includes(authorQuery.toLowerCase())
    );
  }

  // Filter by price range
  filteredBooks = filteredBooks.filter(book => book.price <= maxPrice);

  // Filter by selected genres
  if (selectedGenres.length > 0) {
    filteredBooks = filteredBooks.filter(book => selectedGenres.includes(book.genre));
  }

  const totalBooks = filteredBooks.length;
  const totalPages = Math.ceil(totalBooks / limit) || 1;
  
  // Validate page
  const safePage = Math.max(1, Math.min(page, totalPages));
  
  const startIndex = (safePage - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedBooks = filteredBooks.slice(startIndex, endIndex);

  res.render('products', { 
    title: 'Danh sách sách', 
    activePage: 'browse',
    books: paginatedBooks,
    currentPage: safePage,
    totalPages: totalPages,
    totalBooks: totalBooks,
    startIndex: startIndex,
    endIndex: endIndex,
    authorQuery: authorQuery,
    maxPrice: maxPrice,
    selectedGenres: selectedGenres
  });
});

// Chi tiết sản phẩm
app.get('/products/:id', (req, res) => {
  const book = books.find(b => b.id === req.params.id);
  if (!book) {
    return res.status(404).send('Book not found');
  }
  
  // Lấy 4 sách liên quan ngẫu nhiên hoặc 4 sách đầu tiên
  const relatedBooks = books.filter(b => b.id !== book.id).slice(0, 4);

  res.render('product-detail', { 
    title: book.title, 
    activePage: 'browse',
    book: book,
    relatedBooks: relatedBooks
  });
});

// Giỏ hàng
app.get('/cart', (req, res) => {
  res.render('cart', { title: 'Giỏ hàng', activePage: 'cart' });
});

// Thanh toán
app.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'Thanh toán', activePage: 'cart' });
});

// Tài khoản
app.get('/account', (req, res) => {
  res.render('account', { title: 'Tài khoản', activePage: 'account' });
});

// ============== START SERVER ==============
app.listen(PORT, () => {
  console.log(`🏠 Literary Hearth is running at http://localhost:${PORT}`);
});
