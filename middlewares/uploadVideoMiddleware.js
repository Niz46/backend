// backend/middlewares/uploadVideoMiddleware.js
/**
 * Backwards-compatible wrapper for previous video middleware.
 * Delegates to the memoryStorage upload instance (multerMemory).
 */

const upload = require("./multerMemory");

module.exports = upload;
