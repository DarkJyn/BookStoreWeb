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

// [CREATE/UPDATE] Middleware chạy trước khi lưu giỏ hàng vào MongoDB (pre-save hook)
// Ràng buộc tính nhất quán chéo CSDL (MongoDB & SQL Server)
cartSchema.pre("save", async function (next) {
  try {
    for (const item of this.items) {
      // 1. Kiểm tra số lượng hợp lệ trong giỏ hàng
      if (!item.quantity || item.quantity <= 0) {
        return next(new Error("Số lượng sản phẩm phải lớn hơn 0"));
      }

      // 2. Kiểm tra xem mã sách (bookId) có tồn tại thực sự dưới SQL Server hay không
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

// [READ] Phương thức Giả Lập Populate để lấy dữ liệu Sách từ SQL Server ghép vào cấu trúc Cart MongoDB
cartSchema.methods.populateProducts = async function () {
  const populatedItems = [];

  for (const item of this.items) {
    // Truy vấn thông tin sách tương ứng từ SQL Server bằng Hex ID
    const book = await Book.findById(item.product);

    populatedItems.push({
      product: book, // Đối tượng sách dạng Class Book (SQL Server)
      quantity: item.quantity
    });
  }

  // Trả về cấu trúc giỏ hàng đã được gộp thông tin sản phẩm đầy đủ để gửi lên Client
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

// [READ] Hàm tĩnh dùng để tìm giỏ hàng theo ID và trả về lỗi nếu không tồn tại
cartSchema.statics.findCartByIdOrFail = async function (cartId) {
  // Kiểm tra tính hợp lệ của ObjectId MongoDB
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