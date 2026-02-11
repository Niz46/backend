// backend/middlewares/uploadToCloudinary.js
const { uploadBuffer } = require("../lib/cloudinaryUploader");

/**
 * Middleware: upload files from req.files to Cloudinary (uses memory buffer).
 * - Normalizes multer shapes (array vs fields) into req._files = { <field>: File[] }
 * - Logs only errors by default. To enable dev info logs set FILE_UPLOAD_DEBUG=1 in env.
 *
 * Options:
 *  - imagesKey (string) - field name for images (default "images")
 *  - videosKey (string) - field name for videos (default "videos")
 *  - folder (string) - Cloudinary folder for assets
 *  - maxVideoSize (number) - reject files above this size (bytes)
 *  - imageUploadOptions, videoUploadOptions - forwarded to uploadBuffer
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

  const DEV_DEBUG =
    String(process.env.FILE_UPLOAD_DEBUG || "").toLowerCase() === "1";

  /**
   * Normalize multer's req.files into an object with arrays for each expected field.
   * Supports:
   *  - multer.array(field) => req.files is an Array<File>
   *  - multer.fields([...]) => req.files is { fieldName: Array<File>, ... }
   *  - multer.single(field) => req.file (single file) - converted into array
   *
   * Returns an object: { <fieldName>: File[] }
   */
  const normalizeReqFiles = (req, expectedFields = [imagesKey, videosKey]) => {
    const normalized = {};
    expectedFields.forEach((f) => {
      normalized[f] = [];
    });

    if (!req) return normalized;

    // multer.single() -> req.file
    if (req.file) {
      const fn = req.file.fieldname || imagesKey;
      if (!normalized[fn]) normalized[fn] = [];
      normalized[fn].push(req.file);
      return normalized;
    }

    // multer.array() -> req.files is Array<File>
    if (Array.isArray(req.files)) {
      // group files by their fieldname
      req.files.forEach((file) => {
        const fn = file.fieldname || imagesKey;
        if (!normalized[fn]) normalized[fn] = [];
        normalized[fn].push(file);
      });
      return normalized;
    }

    // multer.fields() -> req.files is object { fieldName: Array<File> }
    if (req.files && typeof req.files === "object") {
      Object.keys(req.files).forEach((key) => {
        if (!normalized[key]) normalized[key] = [];
        // req.files[key] is expected to be an array
        const arr = Array.isArray(req.files[key])
          ? req.files[key]
          : [req.files[key]];
        normalized[key] = normalized[key].concat(arr);
      });
      return normalized;
    }

    // no files
    return normalized;
  };

  return async (req, res, next) => {
    try {
      // Normalize and attach to req._files for predictable downstream use
      req._files = normalizeReqFiles(req);

      if (DEV_DEBUG) {
        // eslint-disable-next-line no-console
        console.info(
          "uploadToCloudinary dev debug - normalized req._files keys:",
          Object.keys(req._files),
        );
        // eslint-disable-next-line no-console
        console.info(
          `uploadToCloudinary dev debug - counts: ${Object.entries(req._files)
            .map(([k, v]) => `${k}:${v.length}`)
            .join(", ")}`,
        );
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
          if (!result || !result.secure_url) {
            throw new Error("Cloudinary image upload failed");
          }
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
          if (!result || !result.secure_url) {
            throw new Error("Cloudinary video upload failed");
          }
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
      // Only log errors (no noisy info logs)
      // Include limited context to help debugging: counts of normalized files (if available)
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
        console.error(
          "uploadToCloudinary error (failed to log context):",
          err && (err.message || err),
        );
      }

      // Known client-caused errors -> 400
      if (
        err &&
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
