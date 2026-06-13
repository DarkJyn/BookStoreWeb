const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT Token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345');
      
      // Get user from the token, excluding password
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'Không tìm thấy tài khoản liên kết với token này.' });
      }
      return next();
    } catch (error) {
      console.error('JWT Verification error:', error.message);
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực. Hãy đăng nhập.' });
  }
};

// Middleware to authorize Admin only
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Yêu cầu quyền truy cập của Quản trị viên.' });
  }
};

module.exports = { protect, adminOnly };
