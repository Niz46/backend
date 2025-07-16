require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const fs = require("fs");
const mime = require("mime-types");
const connectDB = require("./config/db");

// ─── Allowed origins must be known before you use them ───────────────────────
const allowedOrigins = [
  "https://uaacaiinternational-api.onrender.com",
  "https://uaacaiinternational.org",
  "http://localhost:5173",
];

// ─── Static Assets (Uploads) ───────────────────────────────────────────────────
const uploadCorsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"],
  exposedHeaders: ["Accept-Ranges", "Content-Range", "Content-Length"],
};

const app = express();

// ─── Security & Proxy ─────────────────────────────────────────────────────────
// Disable the X‑Powered‑By header
app.disable("x-powered-by");
app.set("trust proxy", true);

// ─── Helmet Security Headers ──────────────────────────────────────────────────
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      styleSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https://uaacaiinternational-api.onrender.com"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  })
);

// ─── Ensure Uploads Directory ─────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadDir}`);
}

// ─── Global CORS (for your API routes) ────────────────────────────────────────
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// … your connectDB(), body‑parser, API routes, etc. …

// ─── CORS Preflight for uploads ───────────────────────────────────────────────
app.options("/uploads/*path", cors(uploadCorsOptions));

// ─── Serve uploads (images & videos) with video‑specific cache and CORS ───────
app.use(
  "/uploads",
  cors(uploadCorsOptions),
  express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      const contentType = mime.lookup(filePath) || "";

      if (contentType.startsWith("video/")) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      } else if (contentType.startsWith("image/")) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }

      res.setHeader(
        "Access-Control-Expose-Headers",
        uploadCorsOptions.exposedHeaders.join(",")
      );
    },
  })
);

// Add a simple landing page at the root URL
app.get("/", (req, res) => {
  res.send("✅ UAACAI API is up and running. Visit /api/* for endpoints.");
});

// Catch-all for any undefined routes (returns JSON 404)
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
