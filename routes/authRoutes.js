// routes/authRoutes.js

const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddlewares");
const upload = require("../middlewares/uploadMiddlewares");
const uploadVideo = require("../middlewares/uploadVideoMiddleware");

const router = express.Router();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) console.warn("⚠️  BACKEND_URL is not defined!");

function makeResponseUrl(filename) {
  const ts = Date.now();
  return {
    url: `${BACKEND_URL}/uploads/${filename}?t=${ts}`,
    timestamp: new Date(ts).toISOString(),
  };
}

// --- AUTH ---
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getUserProfile);

// --- IMAGE UPLOAD (1 or MANY) ---
router.post("/upload-images", (req, res) => {
  // Accept up to 10 files from the `images` field
  upload.array("images", 10)(req, res, (err) => {
    if (err) {
      console.error("Multer error (images):", err);
      return res.status(400).json({ message: err.message });
    }
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: "No images uploaded" });
    }
    // Map each saved filename into our URL format
    const results = files.map((file) => makeResponseUrl(file.filename));
    return res.status(200).json(results);
  });
});

// --- VIDEO UPLOAD (1 or MANY) ---
router.post("/upload-videos", (req, res) => {
  // Accept up to 5 files from the `videos` field
  uploadVideo.array("videos", 5)(req, res, (err) => {
    if (err) {
      console.error("Multer error (videos):", err);
      return res.status(400).json({ message: err.message });
    }
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: "No videos uploaded" });
    }
    const results = files.map((file) => makeResponseUrl(file.filename));
    return res.status(200).json(results);
  });
});

module.exports = router;
