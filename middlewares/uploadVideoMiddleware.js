// middlewares/uploadVideoMiddleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. Absolute path to `uploads/` (same folder as images)
const uploadPath = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log(`✅ Created uploadPath at ${uploadPath}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(
      "🗂 Saving video to:",
      uploadPath,
      file.originalname,
      file.mimetype
    );
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${file.originalname}`;
    console.log("🔖 Assigning filename:", name);
    cb(null, name);
  },
});

const videoFilter = (req, file, cb) => {
  console.log("🔍 videoFilter got mimetype:", file.mimetype);
  const allowTypes = [
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
  ];
  if (allowTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.warn("🚫 Rejected video mimetype:", file.mimetype);
    cb(
      new Error(
        `Only MP4, WebM, Ogg & QuickTime formats allowed (got ${file.mimetype})`
      ),
      false
    );
  }
};

module.exports = multer({ storage, fileFilter: videoFilter });
