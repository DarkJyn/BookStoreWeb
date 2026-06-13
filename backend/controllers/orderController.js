const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');

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
      const dbProduct = await Product.findById(item.product);
      if (!dbProduct) {
        return res.status(404).json({ message: `Sản phẩm ID ${item.product} không tồn tại.` });
      }
      if (dbProduct.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Sách "${dbProduct.title}" không đủ số lượng trong kho. Còn lại: ${dbProduct.stock}` 
        });
      }
    }

    // 2. Create the order
    const order = new Order({
      user: req.user._id,
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      discount,
      tax,
      shippingFee,
      total
    });

    const createdOrder = await order.save();

    // 3. Deduct stock and increment sold count for purchased products
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 
          stock: -item.quantity,
          soldCount: item.quantity
        }
      });
    }

    // 4. Clear user's cart after successful purchase
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
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
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
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }

    // Allow access only if it is the owner or an admin
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này.' });
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
    const orders = await Order.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
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
    const order = await Order.findById(req.params.id);

    if (order) {
      order.status = status;
      const updatedOrder = await order.save();
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
