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

// Validate quantity > 0 và bookId hợp lệ bên SQL Server
orderSchema.pre("validate", async function (next) {
  try {
    if (!this.items || this.items.length === 0) {
      return next(new Error("Đơn hàng phải có ít nhất một sản phẩm"));
    }

    for (const item of this.items) {
      if (!item.product) {
        return next(new Error("Thiếu bookId trong đơn hàng"));
      }

      if (!item.quantity || Number(item.quantity) <= 0) {
        return next(new Error("Số lượng sản phẩm phải lớn hơn 0"));
      }

      const book = await Book.findById(item.product);

      if (!book) {
        return next(new Error(`bookId không hợp lệ: ${item.product}`));
      }

      // Lưu snapshot thông tin sách tại thời điểm đặt hàng
      item.title = item.title || book.title;
      item.image = item.image || book.coverImage || book.image_url || "";
      item.price = Number(item.price || book.price || book.selling_price || 0);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Populate product từ SQL Server khi cần trả về frontend
orderSchema.methods.populateProducts = async function () {
  const populatedItems = [];

  for (const item of this.items) {
    const book = await Book.findById(item.product);

    populatedItems.push({
      product: book,
      title: item.title,
      image: item.image,
      price: item.price,
      quantity: item.quantity
    });
  }

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