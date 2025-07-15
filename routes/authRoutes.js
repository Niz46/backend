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

// must be set in your .env or Render dashboard
//   BACKEND_URL=https://backend-mu6d.onrender.com
const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) {
  console.warn("⚠️  BACKEND_URL is not defined!");
}

function makeResponseUrl(filename) {
  const ts = Date.now();
  return {
    url: `${BACKEND_URL}/uploads/${filename}?t=${ts}`,
    timestamp: new Date(ts).toISOString(),
  };
}

// ---
// AUTH
// ---
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getUserProfile);

// ---
// IMAGE UPLOAD
// ---
router.post("/upload-image", (req, res) => {
  // wrap multer so it never hangs
  upload.single("image")(req, res, (err) => {
    if (err) {
      console.error("Multer error (image):", err);
      return res.status(400).json({ message: err.message });
    }

    console.log("→ /upload-image hit, file:", req.file && req.file.filename);

    if (!req.file) {
      console.warn("No file provided in /upload-image");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { url: imageUrl, timestamp } = makeResponseUrl(req.file.filename);
    return res.status(200).json({ imageUrl, timestamp });
  });
});

// ---
// VIDEO UPLOAD
// ---
router.post("/upload-video", (req, res) => {
  uploadVideo.single("video")(req, res, (err) => {
    if (err) {
      console.error("Multer error (video):", err);
      return res.status(400).json({ message: err.message });
    }

    console.log("→ /upload-video hit, file:", req.file && req.file.filename);

    if (!req.file) {
      console.warn("No file provided in /upload-video");
      return res.status(400).json({ message: "No video file uploaded" });
    }

    const { url: videoUrl, timestamp } = makeResponseUrl(req.file.filename);
    return res.status(200).json({ videoUrl, timestamp });
  });
});

module.exports = router;
