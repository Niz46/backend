// backend/middlewares/uploadToCloudinary.js
const { uploadBuffer } = require("../lib/cloudinaryUploader");

/**
 * Middleware: upload files from req.files to Cloudinary (uses memory buffer).
 * Usage: upload.fields([{ name: "images" }, { name: "videos" }]) before this middleware.
 *
 * Options:
 *  - imagesKey (string) - field name for images (default "images")
 *  - videosKey (string) - field name for videos (default "videos")
 *  - folder (string) - Cloudinary folder for assets
 *  - maxVideoSize (number) - reject files above this size (bytes)
 */
const uploadToCloudinary = (options = {}) => {
  const {
    imagesKey = "images",
    videosKey = "videos",
    folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "blog_app/posts",
    maxVideoSize = Number(
      process.env.UPLOAD_MAX_VIDEO_BYTES || 50 * 1024 * 1024,
    ),
    imageUploadOptions = {},
    videoUploadOptions = {},
  } = options;

  return async (req, res, next) => {
    try {
      const images = (req.files && req.files[imagesKey]) || [];
      const videos = (req.files && req.files[videosKey]) || [];

      const uploadedImageUrls = [];
      const uploadedVideoUrls = [];

      // Upload images
      await Promise.all(
        images.map(async (file) => {
          const opts = {
            folder,
            resource_type: "image",
            use_filename: false,
            unique_filename: true,
            overwrite: false,
            ...imageUploadOptions,
          };

          // call lib uploader
          const result = await uploadBuffer(file.buffer, opts);
          if (!result || !result.secure_url) {
            throw new Error("Cloudinary image upload failed");
          }
          uploadedImageUrls.push(result.secure_url);
        }),
      );

      // Upload videos
      await Promise.all(
        videos.map(async (file) => {
          // Reject very large videos early (safety): we expect <= maxVideoSize
          if (file.size > maxVideoSize) {
            throw new Error(
              `Video too large (${Math.round(file.size / 1024 / 1024)}MB). Max allowed is ${Math.round(
                maxVideoSize / 1024 / 1024,
              )}MB`,
            );
          }

          const opts = {
            folder,
            resource_type: "video",
            use_filename: false,
            unique_filename: true,
            overwrite: false,
            ...videoUploadOptions,
          };

          const result = await uploadBuffer(file.buffer, opts);
          if (!result || !result.secure_url) {
            throw new Error("Cloudinary video upload failed");
          }
          uploadedVideoUrls.push(result.secure_url);
        }),
      );

      // Merge with any existing values passed in body (keeps update behaviour)
      const existingImages = Array.isArray(req.body.coverImageUrl)
        ? req.body.coverImageUrl
        : req.body.coverImageUrl
          ? [req.body.coverImageUrl]
          : [];

      const existingVideos = Array.isArray(req.body.coverVideoUrl)
        ? req.body.coverVideoUrl
        : req.body.coverVideoUrl
          ? [req.body.coverVideoUrl]
          : [];

      req.body.coverImageUrl = [...existingImages, ...uploadedImageUrls];
      req.body.coverVideoUrl = [...existingVideos, ...uploadedVideoUrls];

      return next();
    } catch (err) {
      console.error("uploadToCloudinary error:", err.message || err);
      // Send a 400 for known error messages (client-caused) else pass to error handler
      if (
        err.message &&
        /too large|Invalid|Unexpected|Invalid image|Invalid video/i.test(
          err.message,
        )
      ) {
        return res.status(400).json({ message: err.message });
      }
      return next(err);
    }
  };
};

module.exports = uploadToCloudinary;
