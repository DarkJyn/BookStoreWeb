const Cart = require("../models/Cart");
const Book = require("../models/Book");

// Helper: tìm hoặc tạo cart cho user MongoDB
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({
      user: userId,
      items: []
    });
  }

  return cart;
};

// @desc    Get current user's cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);

    const populatedCart = await cart.populateProducts();

    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

// @desc    Add item or increment quantity in cart
// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  try {
    if (!productId) {
      return res.status(400).json({
        message: "Thiếu productId."
      });
    }

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({
        message: "Số lượng phải lớn hơn 0."
      });
    }

    const book = await Book.findById(productId);

    if (!book) {
      return res.status(404).json({
        message: "bookId không hợp lệ hoặc không tìm thấy sách."
      });
    }

    const cart = await getOrCreateCart(req.user._id);

    const itemIndex = cart.items.findIndex(
      item => item.product === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += Number(quantity);
    } else {
      cart.items.push({
        product: productId,
        quantity: Number(quantity)
      });
    }

    await cart.save();

    const populatedCart = await cart.populateProducts();

    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

// @desc    Update item quantity in cart
// @route   PUT /api/cart
// @access  Private
const updateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;

  try {
    if (!productId) {
      return res.status(400).json({
        message: "Thiếu productId."
      });
    }

    if (quantity === undefined || Number(quantity) <= 0) {
      return res.status(400).json({
        message: "Số lượng phải lớn hơn 0."
      });
    }

    const book = await Book.findById(productId);

    if (!book) {
      return res.status(404).json({
        message: "bookId không hợp lệ hoặc không tìm thấy sách."
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        message: "Không tìm thấy giỏ hàng."
      });
    }

    const itemIndex = cart.items.findIndex(
      item => item.product === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        message: "Sản phẩm không có trong giỏ hàng."
      });
    }

    cart.items[itemIndex].quantity = Number(quantity);

    await cart.save();

    const populatedCart = await cart.populateProducts();

    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

// @desc    Remove an item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
const removeCartItem = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        message: "Thiếu productId."
      });
    }

    const book = await Book.findById(productId);

    if (!book) {
      return res.status(404).json({
        message: "bookId không hợp lệ hoặc không tìm thấy sách."
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        message: "Không tìm thấy giỏ hàng."
      });
    }

    const oldLength = cart.items.length;

    cart.items = cart.items.filter(
      item => item.product !== productId
    );

    if (cart.items.length === oldLength) {
      return res.status(404).json({
        message: "Sản phẩm không có trong giỏ hàng."
      });
    }

    await cart.save();

    const populatedCart = await cart.populateProducts();

    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
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

    res.json({
      message: "Đã xóa toàn bộ giỏ hàng."
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart
};