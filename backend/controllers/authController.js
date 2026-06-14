const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT token helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345', {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'Email này đã được đăng ký sử dụng.' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'customer', // Defaults to customer
      phone: phone || null
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
        profile: {
          avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=random',
          name: user.name,
          phone: user.phone || '',
          email: user.email,
          genre: '',
          bio: ''
        }
      });
    } else {
      res.status(400).json({ message: 'Thông tin đăng ký không hợp lệ.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists by email or username
    const user = await User.findOne({ email: email.toLowerCase() });

    if (user && (await user.comparePassword(password))) {
      if (user.isBlocked) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
      }
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
        profile: {
          avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=random',
          name: user.name,
          phone: user.phone || '',
          email: user.email,
          genre: '',
          bio: ''
        }
      });
    } else {
      res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser
};
