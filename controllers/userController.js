// backend/controllers/userController.js
const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private (admin)
 */
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Forbidden: Admins only." });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    res.json(users);
  } catch (err) {
    console.error("getAllUsers:", err);
    res.status(500).json({ message: "Failed to fetch users." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = { ...req.body };
    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    } else {
      delete payload.password;
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: payload,
      select: {
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        bio: true,
        role: true,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("updateProfile:", err);
    res
      .status(500)
      .json({ message: "Failed to update profile", err: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.user.delete({ where: { id } });
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("deleteUser:", err);
    res
      .status(500)
      .json({ message: "Failed to delete user", err: err.message });
  }
};

module.exports = { getAllUsers, updateProfile, deleteUser };
