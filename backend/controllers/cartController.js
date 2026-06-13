const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Helper to find or create cart for user
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// @desc    Get current user's cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    // Populate product details in the cart
    const populatedCart = await cart.populate('items.product');
    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add item or increment quantity in cart
// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    }

    const cart = await getOrCreateCart(req.user._id);

    // Check if item already exists in cart
    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      // Product exists, increment quantity
      cart.items[itemIndex].quantity += Number(quantity);
    } else {
      // Add new product
      cart.items.push({ product: productId, quantity: Number(quantity) });
    }

    await cart.save();
    const populatedCart = await cart.populate('items.product');
    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update item quantity in cart
// @route   PUT /api/cart
// @access  Private
const updateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;

  if (quantity === undefined || Number(quantity) < 0) {
    return res.status(400).json({ message: 'Số lượng không hợp lệ.' });
  }

  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: 'Không tìm thấy giỏ hàng.' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      if (Number(quantity) === 0) {
        // Remove item if quantity is set to 0
        cart.items.splice(itemIndex, 1);
      } else {
        // Update quantity
        cart.items[itemIndex].quantity = Number(quantity);
      }
      await cart.save();
      const populatedCart = await cart.populate('items.product');
      return res.json(populatedCart);
    } else {
      return res.status(404).json({ message: 'Sản phẩm không có trong giỏ hàng.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove an item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
const removeCartItem = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: 'Không tìm thấy giỏ hàng.' });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== req.params.productId
    );

    await cart.save();
    const populatedCart = await cart.populate('items.product');
    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Clear entire cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    res.json({ message: 'Đã xóa toàn bộ giỏ hàng.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart
};
