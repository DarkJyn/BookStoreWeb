const express = require('express');
const router = express.Router();
const { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} = require('../controllers/productController');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middlewares/auth');

// @desc    Get all products with filters & pagination
// @route   GET /api/products
// @access  Public
router.get('/', getProducts);
router.get("/search", async (req, res) => {
  try {
    const keyword = req.query.q || "";

    const products = await Product.searchByTitle(keyword);

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Search failed"
    });
  }
});

// @desc    Get single product details
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', getProductById);

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, adminOnly, createProduct);

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, updateProduct);

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, deleteProduct);



module.exports = router;
