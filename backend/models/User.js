const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên người dùng là bắt buộc"],
      trim: true
    },

    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      unique: true,
      lowercase: true,
      trim: true
    },

    username: {
      type: String,
      trim: true,
      default: null
    },

    password: {
      type: String,
      required: [true, "Mật khẩu là bắt buộc"],
      minlength: [6, "Mật khẩu phải có ít nhất 6 ký tự"]
    },

    phone: {
      type: String,
      default: null
    },

    address: {
      type: String,
      default: null
    },

    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer"
    },

    isBlocked: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// ─── HOOKS & METHODS ─────────────────────────────────────────────────────────

// [CREATE/UPDATE] Middleware chạy trước khi lưu User vào MongoDB (pre-save hook)
userSchema.pre("save", async function (next) {
  // Nếu người dùng không nhập username, mặc định lấy email làm username
  if (!this.username) {
    this.username = this.email;
  }
  
  // Chỉ thực hiện hash lại mật khẩu khi trường password có sự thay đổi
  if (!this.isModified("password")) return next();

  // Tạo salt độ khó là 10 để băm mật khẩu bảo mật hơn
  const salt = await bcrypt.genSalt(10);
  // Băm mật khẩu bằng thuật toán bcrypt kết hợp với salt
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

// [READ] Phương thức so sánh mật khẩu đầu vào với mật khẩu đã băm trong DB khi Đăng nhập
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);