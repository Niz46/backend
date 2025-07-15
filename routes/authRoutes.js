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

// Make sure to set this in your .env or Render dashboard:
//   BACKEND_URL=https://backend-mu6d.onrender.com
const BACKEND_URL = process.env.BACKEND_URL;

// Helper that builds a cache‑busted URL and ISO timestamp
function makeResponseUrl(filename) {
  const ts = Date.now(); // milliseconds since epoch
  return {
    url: `${BACKEND_URL}/uploads/${filename}?t=${ts}`,
    timestamp: new Date(ts).toISOString(),
  };
}

// Auth routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getUserProfile);

// Image upload route
router.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const { url: imageUrl, timestamp } = makeResponseUrl(req.file.filename);
  res.status(200).json({ imageUrl, timestamp });
});

// Video upload route
router.post("/upload-video", uploadVideo.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No video file uploaded" });
  }

  const { url: videoUrl, timestamp } = makeResponseUrl(req.file.filename);
  res.status(200).json({ videoUrl, timestamp });
});

module.exports = router;
