const express = require('express');
const router = express.Router();
const { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct,
  searchBooks
} = require('../controllers/bookController');
const { protect, adminOnly } = require('../middlewares/auth');

// @desc    Get all books with filters & pagination
// @route   GET /api/products
// @access  Public
router.get('/', getProducts);
  
// @desc    Search books by title
// @route   GET /api/products/search
// @access  Public
router.get("/search", searchBooks);

// @desc    Get single book details
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', getProductById);

// @desc    Create a new book
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, adminOnly, createProduct);

// @desc    Update a book
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, updateProduct);

// @desc    Delete a book
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, deleteProduct);

module.exports = router;
