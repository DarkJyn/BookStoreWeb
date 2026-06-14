const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables relative to this file
dotenv.config({ path: path.join(__dirname, '.env') });

const { connectDB } = require('./config/db.js');
const connectMongoDB = require("./config/mongo.js");
// Connect to Database
connectDB();
connectMongoDB();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Bookstore E-commerce API' });
});

// Register API Routes
app.use('/api/auth', require('./routes/authRoutes.js'));
app.use('/api/products', require('./routes/bookRoutes.js'));
app.use('/api/orders', require('./routes/orderRoutes.js'));
app.use('/api/cart', require('./routes/cartRoutes.js'));
app.use('/api/users', require('./routes/userRoutes.js'));

// Error handler middleware (optional fallback)
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

const PORT = process.env.PORT || 5050;

const startServer = async () => {
  try {
    await connectDB();       // SQL Server
    await connectMongoDB();  // MongoDB

    app.listen(PORT, () => {
      console.log(
        `Server is running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`
      );
    });
  } catch (error) {
    console.error("Server start failed:", error.message);
    process.exit(1);
  }
};
startServer();