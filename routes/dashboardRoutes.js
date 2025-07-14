const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddlewares");
const { getDashboardSummary } = require("../controllers/dashboardController");

// Admin‑only middleware (fixed signature)
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Admin access only" });
};

router.get("/", protect, adminOnly, getDashboardSummary);

module.exports = router;
