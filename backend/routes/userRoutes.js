const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleBlockUser,
  deleteUser,
  getUserOrders
} = require("../controllers/userController");

const { protect, adminOnly } = require("../middlewares/auth");

router.get("/", protect, adminOnly, getUsers);
router.post("/", protect, adminOnly, createUser);

router.get("/:id/orders", protect, adminOnly, getUserOrders);
router.put("/:id/toggle-block", protect, adminOnly, toggleBlockUser);

router.get("/:id", protect, adminOnly, getUserById);
router.put("/:id", protect, adminOnly, updateUser);
router.delete("/:id", protect, adminOnly, deleteUser);

module.exports = router;