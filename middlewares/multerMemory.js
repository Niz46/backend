// backend/middlewares/multerMemory.js
const multer = require("multer");

const memoryStorage = multer.memoryStorage();

// Allowed MIME types for images & videos
const IMAGE_MIMETYPES = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
const VIDEO_MIMETYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

/**
 * fileFilter: accept image files (image/*) and video files (video/*).
 * We classify by mimetype instead of strict fieldname so the server is resilient
 * to small client-side naming differences ("images", "images[]", "0", etc.).
 */
const fileFilter = (req, file, cb) => {
  const { mimetype } = file;

  if (typeof mimetype !== "string") {
    return cb(new Error(`Invalid file type: ${mimetype}`), false);
  }

  if (mimetype.startsWith("image/")) {
    if (IMAGE_MIMETYPES.includes(mimetype)) return cb(null, true);
    return cb(new Error(`Invalid image type: ${mimetype}`), false);
  }

  if (mimetype.startsWith("video/")) {
    if (VIDEO_MIMETYPES.includes(mimetype)) return cb(null, true);
    return cb(new Error(`Invalid video type: ${mimetype}`), false);
  }

  // unknown/unsupported type
  return cb(new Error(`Unsupported file type: ${mimetype}`), false);
};

const upload = multer({
  storage: memoryStorage,
  limits: {
    // single file size limit 50MB (adjust if needed)
    fileSize: Number(
      process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 100 * 1024 * 1024,
    ),
    // limit overall files per request to avoid OOM
    files: Number(process.env.UPLOAD_MAX_FILES || 15),
  },
  fileFilter,
});

module.exports = upload;
