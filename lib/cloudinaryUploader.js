// lib/cloudinaryUploader.js
/**
 * Robust Cloudinary buffer uploader helpers
 *
 * - uploadBuffer(buffer, options) -> uploads buffer via upload_stream
 *   returns result { secure_url, public_id, resource_type, bytes, format }
 *
 * - uploadLargeBuffer(buffer, options) -> attempts chunked upload using uploader.upload_large
 *   (note: some SDK versions require a filepath for upload_large; this function attempts to use
 *    the stream approach first and will throw a clear error if upload_large isn't available).
 *
 * - destroyByPublicId(publicId, resourceType) -> deletes asset by public_id (use when deleting posts)
 *
 * Usage: const { uploadBuffer } = require('../lib/cloudinaryUploader');
 *
 * Keep CLOUDINARY_ env variables in .env and do NOT commit secrets.
 */

const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");

const DEFAULT_FOLDER = "blog_app";

/**
 * Small random suffix generator for public_id fallback
 */
function randomSuffix(len = 6) {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len);
}

/**
 * Core upload via upload_stream using streamifier
 * - buffer: Buffer
 * - options: { folder, resource_type, public_id, timeoutMs, uploadOptions (extra) }
 */
function uploadBuffer(buffer, options = {}) {
  const {
    folder = DEFAULT_FOLDER,
    resource_type = "auto", // 'image' | 'video' | 'auto'
    public_id, // optional custom public_id
    timeoutMs = Number(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || 120_000), // 2 minutes default
    retries = 1, // number of retries on transient errors
    uploadOptions = {}, // raw options forwarded to cloudinary.uploader.upload_stream
  } = options;

  if (!buffer || !Buffer.isBuffer(buffer)) {
    return Promise.reject(
      new Error("uploadBuffer expected a Buffer as first argument"),
    );
  }

  const makeSingleUpload = () =>
    new Promise((resolve, reject) => {
      let resolved = false;

      const uploadOpts = {
        folder,
        resource_type,
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        public_id: public_id ? public_id : undefined,
        ...uploadOptions,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOpts,
        (err, result) => {
          if (resolved) return;
          resolved = true;
          if (err) {
            return reject(err);
          }
          // Normalize output
          return resolve({
            secure_url: result.secure_url,
            url: result.url,
            public_id: result.public_id,
            resource_type: result.resource_type,
            bytes: result.bytes,
            format: result.format,
            width: result.width,
            height: result.height,
            raw: result,
          });
        },
      );

      // handle stream errors
      const readStream = streamifier.createReadStream(buffer);
      readStream.on("error", (err) => {
        if (resolved) return;
        resolved = true;
        reject(err);
      });
      uploadStream.on("error", (err) => {
        if (resolved) return;
        resolved = true;
        reject(err);
      });

      readStream.pipe(uploadStream);

      // timeout safety (if Cloudinary or network hangs)
      if (timeoutMs && timeoutMs > 0) {
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          reject(new Error(`Cloudinary upload timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });

  // Simple retry loop
  const attemptUpload = async (attemptsLeft) => {
    try {
      return await makeSingleUpload();
    } catch (err) {
      // decide whether to retry — network related or 5xx
      const transient =
        /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout|Failed to fetch/i.test(
          String(err.message || err),
        );
      if (transient && attemptsLeft > 0) {
        // short exponential backoff
        const backoff = 250 * Math.pow(2, retries - attemptsLeft);
        await new Promise((r) => setTimeout(r, backoff));
        return attemptUpload(attemptsLeft - 1);
      }
      throw err;
    }
  };

  return attemptUpload(retries);
}

/**
 * uploadLargeBuffer: try to use cloudinary.uploader.upload_large for chunked uploads.
 * NOTE: Depending on cloudinary SDK version upload_large may accept a read stream or may require a filepath.
 * Many apps write a temp file and call upload_large. Since we purposely avoid disk writes, this helper
 * will attempt upload_large but will throw a helpful error to fallback to uploadBuffer when not available.
 */
async function uploadLargeBuffer(buffer, options = {}) {
  const {
    folder = DEFAULT_FOLDER,
    resource_type = "video",
    uploadOptions = {},
  } = options;

  // If uploader.upload_large is not a function, we fallback to uploadBuffer and warn
  if (typeof cloudinary.uploader.upload_large !== "function") {
    // SDK may not support upload_large (older/newer differences) — fallback
    throw new Error(
      "cloudinary.uploader.upload_large is not available in this SDK. Use uploadBuffer for smaller files or implement a temp-file-based upload_large flow.",
    );
  }

  // Attempt to stream into upload_large if possible (some SDKs accept a stream)
  return new Promise((resolve, reject) => {
    try {
      const opts = {
        folder,
        resource_type,
        ...uploadOptions,
      };

      // Some SDKs accept a readable stream as the first argument; others require a path.
      // We'll attempt to pass a stream and handle errors.
      const readStream = streamifier.createReadStream(buffer);
      cloudinary.uploader.upload_large(readStream, opts, (err, result) => {
        if (err) return reject(err);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          bytes: result.bytes,
          format: result.format,
          raw: result,
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * destroyByPublicId - remove an asset by public_id (use resource_type: 'image' | 'video' | 'raw')
 */
async function destroyByPublicId(publicId, resourceType = "image") {
  if (!publicId) throw new Error("destroyByPublicId requires a publicId");
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: resourceType },
      (err, result) => {
        if (err) return reject(err);
        // result example: { result: 'ok' } or { result: 'not found' }
        resolve(result);
      },
    );
  });
}

module.exports = {
  uploadBuffer,
  uploadLargeBuffer,
  destroyByPublicId,
};
