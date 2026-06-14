const mongoose = require("mongoose");
const Book = require("./Book");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: String, // bookId bên SQL Server, ví dụ "00000001"
      required: true
    },

    title: {
      type: String,
      required: true
    },

    image: {
      type: String,
      default: ""
    },

    price: {
      type: Number,
      required: true,
      min: [0, "Giá sản phẩm không hợp lệ"]
    },

    quantity: {
      type: Number,
      required: true,
      min: [1, "Số lượng phải lớn hơn 0"]
    }
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    city: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: false }
);

const paymentResultSchema = new mongoose.Schema(
  {
    paymentId: String,
    status: String,
    updateTime: String,
    email: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Đơn hàng phải có ít nhất một sản phẩm"
      }
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true
    },

    paymentMethod: {
      type: String,
      enum: ["COD", "MOMO", "VNPAY", "PAYPAL", "BANKING"],
      default: "COD"
    },

    paymentResult: paymentResultSchema,

    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },

    discount: {
      type: Number,
      default: 0,
      min: 0
    },

    tax: {
      type: Number,
      default: 0,
      min: 0
    },

    shippingFee: {
      type: Number,
      default: 0,
      min: 0
    },

    total: {
      type: Number,
      required: true,
      min: 0
    },

    status: {
      type: String,
      enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Pending"
    },

    isPaid: {
      type: Boolean,
      default: false
    },

    paidAt: {
      type: Date
    },

    isDelivered: {
      type: Boolean,
      default: false
    },

    deliveredAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// [CREATE] Middleware chạy trước khi Validate đơn hàng (pre-validate hook)
// Thực hiện cơ chế Order Snapshotting (Lưu thông tin tại thời điểm mua)
orderSchema.pre("validate", async function (next) {
  try {
    // 1. Kiểm tra đơn hàng phải chứa ít nhất 1 sản phẩm
    if (!this.items || this.items.length === 0) {
      return next(new Error("Đơn hàng phải có ít nhất một sản phẩm"));
    }

    for (const item of this.items) {
      // 2. Kiểm tra mã sách có trống hay không
      if (!item.product) {
        return next(new Error("Thiếu bookId trong đơn hàng"));
      }

      // 3. Kiểm tra số lượng đặt mua phải lớn hơn 0
      if (!item.quantity || Number(item.quantity) <= 0) {
        return next(new Error("Số lượng sản phẩm phải lớn hơn 0"));
      }

      // 4. Kiểm tra sự tồn tại của sách dưới CSDL SQL Server thông qua custom model Book
      const book = await Book.findById(item.product);

      if (!book) {
        return next(new Error(`bookId không hợp lệ: ${item.product}`));
      }

      // 5. [Bảo toàn hóa đơn]: Sao chụp (Snapshot) thông tin sách tại thời điểm đặt hàng.
      // Tránh việc dữ liệu hóa đơn bị sai lệch khi giá sách hoặc thông tin sách thay đổi/bị xóa sau này.
      item.title = item.title || book.title;
      item.image = item.image || book.coverImage || book.image_url || "";
      item.price = Number(item.price || book.price || book.selling_price || 0);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// [READ] Phương thức Giả Lập Populate để ghép chi tiết sách từ SQL Server vào đơn hàng
orderSchema.methods.populateProducts = async function () {
  const populatedItems = [];

  for (const item of this.items) {
    // Tìm thông tin sách chi tiết nhất từ SQL Server
    const book = await Book.findById(item.product);

    populatedItems.push({
      product: book,      // Đối tượng sách (nếu sách bị xóa dưới SQL Server, trường này có thể trả về null)
      title: item.title,  // Tiêu đề sách chụp lúc đặt hàng (vẫn bảo toàn được tên sách)
      image: item.image,  // Ảnh chụp lúc đặt hàng
      price: item.price,  // Giá mua thực tế của hóa đơn
      quantity: item.quantity
    });
  }

  // Trả về cấu trúc hóa đơn đầy đủ thông tin sản phẩm
  return {
    _id: this._id,
    id: this._id,
    user: this.user,
    items: populatedItems,
    shippingAddress: this.shippingAddress,
    paymentMethod: this.paymentMethod,
    paymentResult: this.paymentResult,
    subtotal: this.subtotal,
    discount: this.discount,
    tax: this.tax,
    shippingFee: this.shippingFee,
    total: this.total,
    status: this.status,
    isPaid: this.isPaid,
    paidAt: this.paidAt,
    isDelivered: this.isDelivered,
    deliveredAt: this.deliveredAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model("Order", orderSchema);