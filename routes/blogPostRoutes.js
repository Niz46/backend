// backend/routes/blogPostRoutes.js
const express = require("express");
const router = express.Router();

const {
  createPost,
  updatePost,
  deletePost,
  getAllPosts,
  getPostBySlug,
  getPostsByTag,
  searchPosts,
  incrementView,
  likePost,
  getTopPosts,
} = require("../controllers/blogPostController");

const { protect } = require("../middlewares/authMiddlewares");
const upload = require("../middlewares/multerMemory");
const uploadToCloudinary = require("../middlewares/uploadToCloudinary");

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Admin access only" });
};

// Use upload.fields to accept both images and videos.
// This expects form field names: "images" and "videos"
const uploadFields = upload.fields([{ name: "images" }, { name: "videos" }]);

// Create post (admin)
router.post(
  "/",
  protect,
  adminOnly,
  uploadFields,
  uploadToCloudinary({ imagesKey: "images", videosKey: "videos" }),
  createPost,
);

// Update post (admin) - allow adding new images/videos (merged by middleware)
router.put(
  "/:id",
  protect,
  adminOnly,
  uploadFields,
  uploadToCloudinary({ imagesKey: "images", videosKey: "videos" }),
  updatePost,
);

// Other endpoints
router.delete("/:id", protect, adminOnly, deletePost);
router.get("/", getAllPosts);
router.get("/slug/:slug", protect, getPostBySlug);
router.get("/tag/:tag", getPostsByTag);
router.get("/search", searchPosts);
router.post("/:id/view", incrementView);
router.post("/:id/like", protect, likePost);
router.get("/trending", getTopPosts);

module.exports = router;
