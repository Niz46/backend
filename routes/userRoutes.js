// routes/userRoutes.js
const express = require("express");
const { getAllUsers } = require("../controllers/userController");
const { protect } = require("../middlewares/authMiddlewares");
const router = express.Router();

// GET /api/users
router.get("/", protect, getAllUsers);

module.exports = router;
