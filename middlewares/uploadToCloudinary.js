// backend/middlewares/uploadToCloudinary.js
const { uploadBuffer } = require("../lib/cloudinaryUploader");

/**
 * Middleware: uploads memory-buffered files to Cloudinary and sets req.body.coverImageUrl / coverVideoUrl arrays.
 * - Normalizes incoming req.files (array/object/single) into req._files = { images: [], videos: [] }
 * - Classifies files by mimetype (image/* -> images, video/* -> videos)
 * - Only logs errors by default (set FILE_UPLOAD_DEBUG=1 for dev info)
 */
const uploadToCloudinary = (options = {}) => {
  const {
    imagesKey = "images",
    videosKey = "videos",
    folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "blog_app/posts",
    maxVideoSize = Number(
      process.env.UPLOAD_MAX_VIDEO_BYTES || 100 * 1024 * 1024,
    ),
    imageUploadOptions = {},
    videoUploadOptions = {},
  } = options;

  const DEV_DEBUG =
    String(process.env.FILE_UPLOAD_DEBUG || "").toLowerCase() === "1";

  // Normalize files into an object and classify by mimetype
  const normalizeAndClassify = (req) => {
    const normalized = { [imagesKey]: [], [videosKey]: [] };

    // single file (multer.single)
    if (req.file) {
      const file = req.file;
      if (file.mimetype && file.mimetype.startsWith("video/"))
        normalized[videosKey].push(file);
      else normalized[imagesKey].push(file);
      return normalized;
    }

    // array shape (multer.array) => req.files is Array<File>
    if (Array.isArray(req.files)) {
      req.files.forEach((file) => {
        if (file && file.mimetype && file.mimetype.startsWith("video/"))
          normalized[videosKey].push(file);
        else normalized[imagesKey].push(file);
      });
      return normalized;
    }

    // fields shape (multer.fields) => req.files is object { fieldName: File[] }
    if (req.files && typeof req.files === "object") {
      Object.keys(req.files).forEach((key) => {
        const arr = Array.isArray(req.files[key])
          ? req.files[key]
          : [req.files[key]];
        arr.forEach((file) => {
          if (file && file.mimetype && file.mimetype.startsWith("video/"))
            normalized[videosKey].push(file);
          else normalized[imagesKey].push(file);
        });
      });
      return normalized;
    }

    return normalized;
  };

  return async (req, res, next) => {
    try {
      req._files = normalizeAndClassify(req);

      if (DEV_DEBUG) {
        // eslint-disable-next-line no-console
        console.info("uploadToCloudinary dev debug - normalized counts:", {
          images: req._files[imagesKey].length,
          videos: req._files[videosKey].length,
        });
      }

      const images = req._files[imagesKey] || [];
      const videos = req._files[videosKey] || [];

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
          const result = await uploadBuffer(file.buffer, opts);
          if (!result || !result.secure_url)
            throw new Error("Cloudinary image upload failed");
          uploadedImageUrls.push(result.secure_url);
        }),
      );

      // Upload videos
      await Promise.all(
        videos.map(async (file) => {
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
          if (!result || !result.secure_url)
            throw new Error("Cloudinary video upload failed");
          uploadedVideoUrls.push(result.secure_url);
        }),
      );

      // Merge with any existing values passed in req.body (backwards-compatible)
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
      try {
        const imgs =
          req && req._files && Array.isArray(req._files[imagesKey])
            ? req._files[imagesKey].length
            : 0;
        const vids =
          req && req._files && Array.isArray(req._files[videosKey])
            ? req._files[videosKey].length
            : 0;
        // eslint-disable-next-line no-console
        console.error(
          `uploadToCloudinary error: ${err && (err.message || err)} | images:${imgs} videos:${vids}`,
        );
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error("uploadToCloudinary error:", err && (err.message || err));
      }

      if (
        err &&
        err.message &&
        /too large|Invalid|Unexpected|Unsupported|Invalid image|Invalid video/i.test(
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
