const Product = require('../models/Product');

// @desc    Get all products with filters & pagination
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

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(sortOptions);

    res.json({
      products,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product details
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const product = new Product({
      title: req.body.title,
      author: req.body.author,
      price: req.body.price,
      originalPrice: req.body.originalPrice || null,
      coverImage: req.body.coverImage,
      imageAlt: req.body.imageAlt || req.body.title,
      genre: req.body.genre || 'Khac',
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

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      product.title = req.body.title || product.title;
      product.author = req.body.author || product.author;
      product.price = req.body.price ?? product.price;
      product.originalPrice = req.body.originalPrice ?? product.originalPrice;
      product.coverImage = req.body.coverImage || product.coverImage;
      product.imageAlt = req.body.imageAlt || product.imageAlt;
      product.genre = req.body.genre || product.genre;
      product.rating = req.body.rating ?? product.rating;
      product.stockStatus = req.body.stockStatus || product.stockStatus;
      product.publisher = req.body.publisher || product.publisher;
      product.year = req.body.year ?? product.year;
      product.format = req.body.format || product.format;
      product.stock = req.body.stock ?? product.stock;
      product.importPrice = req.body.importPrice ?? product.importPrice;
      product.shelfLocation = req.body.shelfLocation || product.shelfLocation;
      product.description = req.body.description || product.description;

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const result = await Product.deleteOne({ _id: req.params.id });
    if (result.deletedCount > 0) {
      res.json({ message: 'Đã xóa sản phẩm thành công.' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
