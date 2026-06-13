const Book = require('../models/Book');

// @desc    Get all books with filters & pagination
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12;
  const search = req.query.search ? req.query.search.trim() : '';
  const author = req.query.author ? req.query.author.trim() : '';
  const maxPrice = parseInt(req.query.maxPrice, 10) || Infinity;
  const sortBy = req.query.sort || 'newest';
  const genre = req.query.genre;

  let query = {};

  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  if (author) {
    query.author = { $regex: author, $options: 'i' };
  }

  if (maxPrice !== Infinity) {
    query.price = { $lte: maxPrice };
  }

  if (genre) {
    const genres = Array.isArray(genre) ? genre : [genre];
    query.genre = { $in: genres };
  }

  try {
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
      default:
        sortOptions = { createdAt: -1 }; // newest
        break;
    }

    const total = await Book.countDocuments(query);
    const books = await Book.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(sortOptions);

    res.json({
      products: books, // Trả về trường products để tương thích với frontend
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single book details
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (book) {
      res.json(book);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sách.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new book
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const book = new Book({
      title: req.body.title,
      author: req.body.author,
      price: req.body.price,
      originalPrice: req.body.originalPrice || null,
      coverImage: req.body.coverImage,
      imageAlt: req.body.imageAlt || req.body.title,
      genre: req.body.genre || 'Khác',
      rating: req.body.rating || 4,
      stockStatus: req.body.stockStatus || 'In stock',
      publisher: req.body.publisher || '',
      year: req.body.year || new Date().getFullYear(),
      format: req.body.format || '',
      stock: req.body.stock || 0,
      importPrice: req.body.importPrice || null,
      shelfLocation: req.body.shelfLocation || '',
      description: Array.isArray(req.body.description) 
        ? req.body.description 
        : req.body.description ? [req.body.description] : []
    });

    const createdBook = await book.save();
    res.status(201).json(createdBook);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a book
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (book) {
      book.title = req.body.title || book.title;
      book.author = req.body.author || book.author;
      book.price = req.body.price ?? book.price;
      book.originalPrice = req.body.originalPrice ?? book.originalPrice;
      book.coverImage = req.body.coverImage || book.coverImage;
      book.imageAlt = req.body.imageAlt || book.imageAlt;
      book.genre = req.body.genre || book.genre;
      book.rating = req.body.rating ?? book.rating;
      book.stockStatus = req.body.stockStatus || book.stockStatus;
      book.publisher = req.body.publisher || book.publisher;
      book.year = req.body.year ?? book.year;
      book.format = req.body.format || book.format;
      book.stock = req.body.stock ?? book.stock;
      book.importPrice = req.body.importPrice ?? book.importPrice;
      book.shelfLocation = req.body.shelfLocation || book.shelfLocation;
      book.description = req.body.description || book.description;

      const updatedBook = await book.save();
      res.json(updatedBook);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sách.' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a book
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const result = await Book.deleteOne({ _id: req.params.id });
    if (result.deletedCount > 0) {
      res.json({ message: 'Đã xóa sách thành công.' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy sách.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const searchBooks = async (req, res) => {
  try {
    const keyword = req.query.q || "";
    const books = await Book.searchByTitle(keyword);
    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Search failed"
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchBooks
};
