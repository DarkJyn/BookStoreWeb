const mongoose = require("mongoose");
const Book = require("./Book");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: String, // bookId bên SQL Server, ví dụ "00000001"
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Số lượng phải lớn hơn 0"]
    }
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    items: [cartItemSchema]
  },
  { timestamps: true }
);

// Validate quantity > 0 và bookId hợp lệ trước khi lưu
cartSchema.pre("save", async function (next) {
  try {
    for (const item of this.items) {
      if (!item.quantity || item.quantity <= 0) {
        return next(new Error("Số lượng sản phẩm phải lớn hơn 0"));
      }

      const book = await Book.findById(item.product);

      if (!book) {
        return next(new Error(`BookId không hợp lệ: ${item.product}`));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Giả lập populate giống code cũ
cartSchema.methods.populateProducts = async function () {
  const populatedItems = [];

  for (const item of this.items) {
    const book = await Book.findById(item.product);

    populatedItems.push({
      product: book,
      quantity: item.quantity
    });
  }

  return {
    _id: this._id,
    id: this._id,
    user: this.user,
    userId: this.user,
    items: populatedItems,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Validate cartId tồn tại
cartSchema.statics.findCartByIdOrFail = async function (cartId) {
  if (!mongoose.Types.ObjectId.isValid(cartId)) {
    throw new Error("cartId không hợp lệ");
  }

  const cart = await this.findById(cartId);

  if (!cart) {
    throw new Error("Không tìm thấy giỏ hàng");
  }

  return cart;
};

module.exports = mongoose.model("Cart", cartSchema);