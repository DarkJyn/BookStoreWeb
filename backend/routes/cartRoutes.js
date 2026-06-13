const express = require('express');
const router = express.Router();
const { 
  getCart, 
  addToCart, 
  updateCartItem, 
  removeCartItem, 
  clearCart 
} = require('../controllers/cartController');
const { protect } = require('../middlewares/auth');

// @desc    Get current user's cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, getCart);

// @desc    Add item or increment quantity in cart
// @route   POST /api/cart
// @access  Private
router.post('/', protect, addToCart);

// @desc    Update item quantity in cart
// @route   PUT /api/cart
// @access  Private
router.put('/', protect, updateCartItem);

// @desc    Clear entire cart
// @route   DELETE /api/cart
// @access  Private
router.delete('/', protect, clearCart);

// @desc    Remove an item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
router.delete('/:productId', protect, removeCartItem);

module.exports = router;
