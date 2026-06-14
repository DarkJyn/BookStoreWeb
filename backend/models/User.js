const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { getPool } = require("../config/db");

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
      trim: true
      // tự động gán bằng email trong pre-save hook
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

// username luôn bằng email → dùng lại index unique của email, không cần index riêng
// [CREATE/UPDATE] Middleware chạy trước khi lưu User vào MongoDB (pre-save hook)
userSchema.pre("save", async function (next) {
  // Nếu người dùng không nhập username, mặc định lấy email làm username (tránh lỗi duplicate null)
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

// Post-save: đồng bộ dữ liệu user sang oltp.Customer trong SQL Server
userSchema.post("save", async function (doc) {
  try {
    await syncUserToSQL(doc);
  } catch (error) {
    // Log lỗi nhưng không throw — đảm bảo user vẫn được lưu vào MongoDB
    console.error("[User.post-save] Sync to SQL failed:", error.message);
  }
});

// Post findOneAndUpdate: đồng bộ khi user được cập nhật qua findByIdAndUpdate
userSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) {
    try {
      await syncUserToSQL(doc);
    } catch (error) {
      console.error("[User.post-findOneAndUpdate] Sync to SQL failed:", error.message);
    }
  }
});

/**
 * Đồng bộ dữ liệu user MongoDB → oltp.Customer SQL Server
 * UPSERT theo email: nếu email đã tồn tại trong Customer thì UPDATE, nếu chưa thì INSERT.
 * 
 * Mapping:
 *   MongoDB.name    → Customer.full_name
 *   MongoDB.email   → Customer.email
 *   MongoDB.phone   → Customer.phone
 *   MongoDB.address → Customer.address
 */
async function syncUserToSQL(userDoc) {
  const pool = await getPool();

  const fullName = userDoc.name || '';
  const email    = userDoc.email || '';
  const phone    = userDoc.phone || null;
  const address  = userDoc.address || null;

  if (!email) {
    console.warn("[syncUserToSQL] Skipping sync — no email.");
    return;
  }

  // Kiểm tra email đã tồn tại trong Customer chưa
  const existing = await pool.request()
    .input('email', email)
    .query(`SELECT customer_id FROM oltp.Customer WHERE email = @email`);

  if (existing.recordset.length > 0) {
    // UPDATE customer hiện tại
    await pool.request()
      .input('fullName', fullName)
      .input('email',    email)
      .input('phone',    phone)
      .input('address',  address)
      .query(`
        UPDATE oltp.Customer 
        SET full_name = @fullName, phone = @phone, address = @address
        WHERE email = @email
      `);
    console.log(`[syncUserToSQL] Updated Customer (email: ${email})`);
  } else {
    // INSERT customer mới
    await pool.request()
      .input('fullName', fullName)
      .input('email',    email)
      .input('phone',    phone)
      .input('address',  address)
      .query(`
        INSERT INTO oltp.Customer (full_name, email, phone, address)
        VALUES (@fullName, @email, @phone, @address)
      `);
    console.log(`[syncUserToSQL] Inserted new Customer (email: ${email})`);
  }
}

// [READ] Phương thức so sánh mật khẩu đầu vào với mật khẩu đã băm trong DB khi Đăng nhập
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Lấy customer_id từ SQL Server theo email của user MongoDB
 * Dùng khi cần liên kết order với customer
 */
userSchema.methods.getCustomerId = async function () {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('email', this.email)
      .query(`SELECT customer_id FROM oltp.Customer WHERE email = @email`);
    
    if (result.recordset.length > 0) {
      return result.recordset[0].customer_id;
    }
    return null;
  } catch (error) {
    console.error("[getCustomerId] Error:", error.message);
    return null;
  }
};

/** Export hàm syncUserToSQL để dùng ở nơi khác nếu cần */
const User = mongoose.model("User", userSchema);
User.syncUserToSQL = syncUserToSQL;

module.exports = User;