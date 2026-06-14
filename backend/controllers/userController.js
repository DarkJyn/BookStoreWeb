const User = require("../models/User");
const Order = require("../models/Order");

// GET /api/users
const getUsers = async (req, res) => {
  try {
    const { q = "" } = req.query;

    const query = { role: "customer" };

    if (q.trim()) {
      const keyword = q.trim();

      query.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { phone: { $regex: keyword, $options: "i" } }
      ];
    }

    const customers = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 });

    const orderStats = await Order.getCustomerStats();

    const statsMap = {};
    let totalRevenue = 0;

    orderStats.forEach((stat) => {
      if (stat.email) {
        const emailKey = stat.email.toLowerCase().trim();
        statsMap[emailKey] = {
          orderCount: stat.orderCount,
          totalSpending: stat.totalSpending
        };

        totalRevenue += stat.totalSpending;
      }
    });

    const customersWithStats = customers.map((c) => {
      const emailKey = c.email.toLowerCase().trim();
      const stats = statsMap[emailKey] || {
        orderCount: 0,
        totalSpending: 0
      };

      return {
        ...c.toObject(),
        orderCount: stats.orderCount,
        totalSpending: stats.totalSpending
      };
    });

    const totalCustomersCount = await User.countDocuments({
      role: "customer"
    });

    const blockedCustomersCount = await User.countDocuments({
      role: "customer",
      isBlocked: true
    });

    res.json({
      users: customersWithStats,
      stats: {
        totalCustomersCount,
        blockedCustomersCount,
        totalRevenue
      }
    });
  } catch (error) {
    console.error("Error loading users:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng."
      });
    }

    res.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// POST /api/users
const createUser = async (req, res) => {
  const { name, email, phone, password, address, role } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập tên, email và mật khẩu."
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email đã tồn tại."
      });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      password,
      address: address ? address.trim() : null,
      role: role || "customer"
    });

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json(userResponse);
  } catch (error) {
    console.error("Error creating user:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  const { name, email, phone, password, address, role } = req.body;

  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng."
      });
    }

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      if (normalizedEmail !== user.email) {
        const emailExists = await User.findOne({
          email: normalizedEmail
        });

        if (emailExists) {
          return res.status(400).json({
            message: "Email đã tồn tại."
          });
        }

        user.email = normalizedEmail;
      }
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone ? phone.trim() : null;
    if (address !== undefined) user.address = address ? address.trim() : null;
    if (role) user.role = role;

    if (password && password.trim().length >= 6) {
      user.password = password;
    }

    const updatedUser = await user.save();

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.json(userResponse);
  } catch (error) {
    console.error("Error updating user:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// PUT /api/users/:id/toggle-block
const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng."
      });
    }

    user.isBlocked = !user.isBlocked;

    await user.save();

    res.json({
      success: true,
      isBlocked: user.isBlocked,
      message: user.isBlocked
        ? "Đã khóa tài khoản thành công."
        : "Đã mở khóa tài khoản thành công."
    });
  } catch (error) {
    console.error("Error toggling block status:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng."
      });
    }

    await user.deleteOne();

    res.json({
      success: true,
      message: "Xóa người dùng thành công."
    });
  } catch (error) {
    console.error("Error deleting user:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

// GET /api/users/:id/orders
const getUserOrders = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng."
      });
    }

    const orders = await Order.find({
      user: req.params.id
    }).sort({ createdAt: -1 });

    res.json({
      user,
      orders
    });
  } catch (error) {
    console.error("Error fetching user orders:", error.message);

    res.status(500).json({
      message: "Lỗi máy chủ: " + error.message
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleBlockUser,
  deleteUser,
  getUserOrders
};