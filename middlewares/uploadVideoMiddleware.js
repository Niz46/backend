// middlewares/uploadVideoMiddleware.js
const multer = require("multer");

// Reuse your existing diskStorage or define a new one
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`)
});

// Permit common video formats
const videoFilter = (req, file, cb) => {
  const allowTypes = [
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
  ];
  if (allowTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only MP4, WebM, Ogg, and QuickTime formats are allowed"
      ),
      false
    );
  }
};

const uploadVideo = multer({ storage, fileFilter: videoFilter });

module.exports = uploadVideo;
