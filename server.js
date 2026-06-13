const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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

app.get('/', (req, res) => {
  const books = getBooks();
  res.render('index', { title: 'Trang chu', activePage: 'home', books: books.slice(0, 4) });
});

app.get('/products', (req, res) => {
  const books = getBooks();
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 12;
  const searchQuery = req.query.q ? req.query.q.trim() : '';
  const authorQuery = req.query.author ? req.query.author.trim() : '';
  const maxPrice = parseInt(req.query.maxPrice, 10) || 500000;
  const sortBy = req.query.sort || 'newest';
  const genreQuery = req.query.genre;
  const publisherQuery = req.query.publisher ? req.query.publisher.trim() : '';
  let selectedGenres = [];

  if (genreQuery) {
    selectedGenres = Array.isArray(genreQuery) ? genreQuery : [genreQuery];
  }

  let filteredBooks = [...books];

  // Tìm kiếm theo từ khóa (tên sách hoặc tác giả)
  if (searchQuery) {
    const keyword = searchQuery.toLowerCase();
    filteredBooks = filteredBooks.filter((book) =>
      (book.title || '').toLowerCase().includes(keyword) ||
      (book.author || '').toLowerCase().includes(keyword)
    );
  }

  if (authorQuery) {
    filteredBooks = filteredBooks.filter((book) =>
      book.author.toLowerCase().includes(authorQuery.toLowerCase())
    );
  }

  filteredBooks = filteredBooks.filter((book) => book.price <= maxPrice);

  if (selectedGenres.length > 0) {
    filteredBooks = filteredBooks.filter((book) => selectedGenres.includes(book.genre));
  }

  if (publisherQuery) {
    filteredBooks = filteredBooks.filter((book) =>
      (book.publisher || '').toLowerCase() === publisherQuery.toLowerCase()
    );
  }

  switch (sortBy) {
    case 'price_asc':
      filteredBooks.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      filteredBooks.sort((a, b) => b.price - a.price);
      break;
    case 'bestselling':
      filteredBooks.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
      break;
    case 'rating':
      filteredBooks.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    default:
      break;
  }

  const totalBooks = filteredBooks.length;
  const totalPages = Math.ceil(totalBooks / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const endIndex = startIndex + limit;

  res.render('products', {
    title: 'Danh sach sach',
    activePage: 'browse',
    books: filteredBooks.slice(startIndex, endIndex),
    currentPage: safePage,
    totalPages,
    totalBooks,
    startIndex,
    endIndex,
    searchQuery,
    authorQuery,
    maxPrice,
    selectedGenres,
    sortBy,
    publisherQuery,
    publishers: [...new Set(getBooks().map((b) => b.publisher).filter(Boolean))].sort()
  });
});

app.get('/products/:id', (req, res) => {
  const books = getBooks();
  const book = books.find((item) => item.id === req.params.id);
  if (!book) return res.status(404).send('Book not found');

  res.render('product-detail', {
    title: book.title,
    activePage: 'browse',
    book,
    relatedBooks: books.filter((item) => item.id !== book.id).slice(0, 4)
  });
});

app.get('/cart', (req, res) => {
  res.render('cart', { title: 'Gio hang', activePage: 'cart' });
});

app.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'Thanh toan', activePage: 'cart' });
});

app.get('/account', (req, res) => {
  res.render('account', { title: 'Tai khoan', activePage: 'account' });
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
  res.render('admin/login', { title: 'Dang nhap Quan tri', error: null });
});

app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  const admin = getUsers().find((user) =>
    (user.email === email || user.username === email) &&
    user.password === password &&
    user.role === 'admin'
  );

  if (admin) {
    req.session.admin = admin;
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login', {
    title: 'Dang nhap Quan tri',
    error: 'Tai khoan hoac mat khau khong dung'
  });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const books = getBooks();
  res.render('admin/dashboard', {
    title: 'Bang dieu khien',
    activePage: 'dashboard',
    admin: req.session.admin,
    totalBooks: books.length
  });
});

app.get('/admin/books', requireAdmin, (req, res) => {
  const { q = '', genre = '', status = '' } = req.query;
  const allBooks = getBooks();
  let books = [...allBooks];

  if (q.trim()) {
    const keyword = q.trim().toLowerCase();
    books = books.filter((book) =>
      [book.title, book.author, book.id, book.publisher].some((field) =>
        String(field || '').toLowerCase().includes(keyword)
      )
    );
  }

  if (genre) books = books.filter((book) => book.genre === genre);
  if (status) books = books.filter((book) => book.stockStatus === status);

  res.render('admin/books', {
    title: 'Quan ly sach',
    activePage: 'books',
    admin: req.session.admin,
    books,
    totalBooks: allBooks.length,
    filters: { q, genre, status },
    genres: [...new Set(allBooks.map((book) => book.genre).filter(Boolean))].sort(),
    statuses: [...new Set(allBooks.map((book) => book.stockStatus).filter(Boolean))].sort()
  });
});

app.get('/admin/book-form', requireAdmin, (req, res) => {
  res.render('admin/book-form', {
    title: 'Them sach',
    activePage: 'books',
    admin: req.session.admin,
    book: null,
    errors: []
  });
});

app.get('/admin/books/:id/edit', requireAdmin, (req, res) => {
  const book = getBooks().find((item) => item.id === req.params.id);
  if (!book) return res.status(404).send('Book not found');

  res.render('admin/book-form', {
    title: 'Sua sach',
    activePage: 'books',
    admin: req.session.admin,
    book,
    errors: []
  });
});

app.post('/admin/books', requireAdmin, (req, res) => {
  const errors = [];
  if (!req.body.title?.trim()) errors.push('Ten sach la bat buoc');
  if (!req.body.author?.trim()) errors.push('Tac gia la bat buoc');

  if (errors.length) {
    return res.status(400).render('admin/book-form', {
      title: 'Them sach',
      activePage: 'books',
      admin: req.session.admin,
      book: req.body,
      errors
    });
  }

  const books = getBooks();
  const nextNumber = books.reduce((max, book) => {
    const match = String(book.id || '').match(/book_(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

  books.unshift({ id: `book_${nextNumber}`, ...buildBookPayload(req.body) });
  saveBooks(books);
  res.redirect('/admin/books');
});

app.post('/admin/books/:id', requireAdmin, (req, res) => {
  const books = getBooks();
  const index = books.findIndex((book) => book.id === req.params.id);
  if (index === -1) return res.status(404).send('Book not found');

  books[index] = buildBookPayload(req.body, books[index]);
  saveBooks(books);
  res.redirect('/admin/books');
});

app.post('/admin/books/:id/delete', requireAdmin, (req, res) => {
  const books = getBooks();
  const nextBooks = books.filter((book) => book.id !== req.params.id);
  if (nextBooks.length === books.length) return res.status(404).send('Book not found');

  saveBooks(nextBooks);
  res.redirect('/admin/books');
});

app.get('/admin/promotions', requireAdmin, (req, res) => {
  res.render('admin/promotions', { title: 'Quan ly khuyen mai', activePage: 'promotions', admin: req.session.admin });
});

app.get('/admin/orders', requireAdmin, (req, res) => {
  res.render('admin/orders', { title: 'Quan ly don hang', activePage: 'orders', admin: req.session.admin });
});

app.get('/admin/customers', requireAdmin, (req, res) => {
  res.render('admin/customers', { title: 'Quan ly khach hang', activePage: 'customers', admin: req.session.admin });
});

app.get('/admin/inventory', requireAdmin, (req, res) => {
  res.render('admin/inventory', { title: 'Quan ly ton kho', activePage: 'inventory', admin: req.session.admin });
});

app.get('/admin/import', requireAdmin, (req, res) => {
  res.render('admin/import', { title: 'Nhap hang', activePage: 'import', admin: req.session.admin });
});

app.get('/admin/staff', requireAdmin, (req, res) => {
  res.render('admin/staff', { title: 'Quan ly nhan vien', activePage: 'staff', admin: req.session.admin });
});

app.get('/admin/reports', requireAdmin, (req, res) => {
  res.render('admin/reports', { title: 'Bao cao thong ke', activePage: 'reports', admin: req.session.admin });
});

app.listen(PORT, () => {
  console.log(`Literary Hearth is running at http://localhost:${PORT}`);
});
