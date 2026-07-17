const express = require("express");
const router = express.Router();
const {
  createEvent,
  getUpcomingEvents,
  deleteEvent,
} = require("../controllers/eventController");
const { protect } = require("../middlewares/authMiddlewares");
const upload = require("../middlewares/multerMemory");
const uploadToCloudinary = require("../middlewares/uploadToCloudinary");

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Admin access only" });
};

// Upload config reusing your existing setup
const uploadFields = upload.fields([{ name: "images" }]);

router.get("/upcoming", getUpcomingEvents);

router.post(
  "/",
  protect,
  adminOnly,
  uploadFields,
  uploadToCloudinary({ imagesKey: "images" }),
  createEvent,
);

router.delete("/:id", protect, adminOnly, deleteEvent);

module.exports = router;
