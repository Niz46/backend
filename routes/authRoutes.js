// backend/routes/authRoutes.js
const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddlewares");

// NEW: memory multer + cloudinary uploader
const upload = require("../middlewares/multerMemory"); // memoryStorage multer
const uploadToCloudinary = require("../middlewares/uploadToCloudinary");

const router = express.Router();

// Optional: keep BACKEND_URL for legacy behaviour if needed
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3002";

function makeResponseUrlFromCloud(url) {
  return {
    url,
    timestamp: new Date().toISOString(),
  };
}

function makeResponseUrlLocal(filename) {
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

// --- simple admin-only guard for uploads ---
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Admin access only" });
};

/**
 * IMAGE UPLOAD — streams `images` (array) to Cloudinary
 * - protected route (admin only)
 * - accepts multipart/form-data with field name `images`
 * - response: array of { url, timestamp }
 */
router.post(
  "/upload-images",
  protect,
  adminOnly,
  // multer memory parser: accepts up to 10 files in field "images"
  upload.array("images", 10),
  // our middleware that uploads files to Cloudinary and attaches req.body.coverImageUrl = [secure_urls]
  uploadToCloudinary({
    imagesKey: "images",
    videosKey: "videos",
    folder: "blog_app/images",
  }),
  (req, res) => {
    // uploadToCloudinary sets req.body.coverImageUrl (array of secure URLs)
    const urls = Array.isArray(req.body.coverImageUrl)
      ? req.body.coverImageUrl
      : [];
    if (!urls.length) {
      // fallback: if old disk-based multer used, return local URLs (compat)
      const localFiles = (req.files || []).map((f) =>
        makeResponseUrlLocal(f.filename),
      );
      if (localFiles.length) return res.status(200).json(localFiles);
      return res.status(400).json({ message: "No images uploaded" });
    }
    const results = urls.map((u) => makeResponseUrlFromCloud(u));
    return res.status(200).json(results);
  },
);

/**
 * VIDEO UPLOAD — streams `videos` to Cloudinary
 * - protected route (admin only)
 * - accepts multipart/form-data with field name `videos`
 * - response: array of { url, timestamp }
 */
router.post(
  "/upload-videos",
  protect,
  adminOnly,
  upload.array("videos", 5),
  uploadToCloudinary({
    imagesKey: "images",
    videosKey: "videos",
    folder: "blog_app/videos",
  }),
  (req, res) => {
    const urls = Array.isArray(req.body.coverVideoUrl)
      ? req.body.coverVideoUrl
      : [];
    if (!urls.length) {
      const localFiles = (req.files || []).map((f) =>
        makeResponseUrlLocal(f.filename),
      );
      if (localFiles.length) return res.status(200).json(localFiles);
      return res.status(400).json({ message: "No videos uploaded" });
    }
    const results = urls.map((u) => makeResponseUrlFromCloud(u));
    return res.status(200).json(results);
  },
);

// Public profile-image upload (no auth). Intended for user profile pictures (small files).
router.post(
  "/upload-images-public",
  // accept any file field name; uploadToCloudinary will classify by mimetype
  upload.any(),
  uploadToCloudinary({
    imagesKey: "images",
    folder: "blog_app/profile_images",
  }),
  (req, res) => {
    const urls = Array.isArray(req.body.coverImageUrl)
      ? req.body.coverImageUrl
      : [];
    if (!urls.length) {
      return res
        .status(400)
        .json({ message: "No images uploaded to Cloudinary" });
    }
    const results = urls.map((u) => makeResponseUrlFromCloud(u));
    return res.status(200).json(results);
  },
);

router.post(
  "/upload-videos-public",
  upload.any(),
  uploadToCloudinary({
    videosKey: "videos",
    folder: "blog_app/profile_videos",
  }),
  (req, res) => {
    const urls = Array.isArray(req.body.coverVideoUrl)
      ? req.body.coverVideoUrl
      : [];
    if (!urls.length) {
      return res
        .status(400)
        .json({ message: "No videos uploaded to Cloudinary" });
    }
    const results = urls.map((u) => makeResponseUrlFromCloud(u));
    return res.status(200).json(results);
  },
);

module.exports = router;
