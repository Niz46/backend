// middlewares/uploadMiddlewares.js
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(
      "🗂  Saving file to uploads/:",
      file.originalname,
      file.mimetype
    );
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${file.originalname}`;
    console.log("🔖  Assigning filename:", name);
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  console.log("🔍  fileFilter got mimetype:", file.mimetype);
  const allowTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
    // add more common types while debugging:
    "image/gif",
    "image/svg+xml",
  ];

  if (allowTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.warn("🚫  Rejected mimetype:", file.mimetype);
    cb(
      new Error(
        `Only jpeg, jpg, png, webp, gif & svg formats allowed (got ${file.mimetype})`
      ),
      false
    );
  }
};

module.exports = multer({ storage, fileFilter });
