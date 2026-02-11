// backend/middlewares/uploadMiddlewares.js
/**
 * Backwards-compatible wrapper:
 * If other files import uploadMiddlewares.js (disk-based), keep same API
 * but delegate to the memory-based multer instance in multerMemory.js.
 *
 * This prevents you having to rewrite every import.
 */

const upload = require("./multerMemory");

module.exports = upload;
