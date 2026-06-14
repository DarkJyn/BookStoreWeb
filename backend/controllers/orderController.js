const Order = require('../models/Order');
const Book = require('../models/Book');
const Cart = require('../models/Cart');
const User = require('../models/User');

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  const { 
    items, 
    shippingAddress, 
    paymentMethod, 
    subtotal, 
    discount = 0, 
    tax, 
    shippingFee = 0, 
    total 
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'Không thể tạo đơn hàng với giỏ hàng trống.' });
  }

  try {
    // 1. Verify item prices and stock availability
    for (const item of items) {
      const dbBook = await Book.findById(item.product);
      if (!dbBook) {
        return res.status(404).json({ message: `Sách ID ${item.product} không tồn tại.` });
      }
      if (dbBook.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Sách "${dbBook.title}" không đủ số lượng trong kho. Còn lại: ${dbBook.stock}` 
        });
      }
    }

    // 2. Lấy customer_id từ SQL dựa trên email user MongoDB
    const mongoUser = await User.findById(req.user._id);
    let customerId = null;
    if (mongoUser) {
      customerId = await mongoUser.getCustomerId();
    }

    // 3. Create the order (SQL Server)
    const createdOrder = await Order.create({
      customerId,
      user: req.user._id,
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      discount,
      tax,
      shippingFee,
      total,
      status: 'Pending'
    });

    // 4. Deduct stock for purchased products
    for (const item of items) {
      await Book.findByIdAndUpdate(item.product, {
        $inc: { 
          stock: -item.quantity
        }
      });
    }

    // 5. Clear user's cart after successful purchase
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    // Lấy customer_id từ email user MongoDB
    const mongoUser = await User.findById(req.user._id);
    let customerId = null;
    if (mongoUser) {
      customerId = await mongoUser.getCustomerId();
    }

    if (!customerId) {
      return res.json([]);
    }

    const orders = await Order.find({ customer_id: customerId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  const { status } = req.body;

  if (!['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ.' });
  }

  try {
    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, { status });

    if (updatedOrder) {
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus
};
