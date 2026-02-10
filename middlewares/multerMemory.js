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
 * fileFilter: allow image files for field "images", and video files for field "videos".
 * If client sends wrong type we reject it early.
 */
const fileFilter = (req, file, cb) => {
  const { fieldname, mimetype } = file;

  if (fieldname === "images") {
    if (IMAGE_MIMETYPES.includes(mimetype)) return cb(null, true);
    return cb(new Error(`Invalid image type: ${mimetype}`), false);
  }

  if (fieldname === "videos") {
    if (VIDEO_MIMETYPES.includes(mimetype)) return cb(null, true);
    return cb(new Error(`Invalid video type: ${mimetype}`), false);
  }

  // If unknown field, reject (explicit)
  return cb(new Error(`Unexpected file field: ${fieldname}`), false);
};

const upload = multer({
  storage: memoryStorage,
  limits: {
    // single file size limit 50MB (adjust if needed)
    fileSize: Number(
      process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 50 * 1024 * 1024,
    ),
    // limit overall files per request to avoid OOM
    files: Number(process.env.UPLOAD_MAX_FILES || 6),
  },
  fileFilter,
});

module.exports = upload;
