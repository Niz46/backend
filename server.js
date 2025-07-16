// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const fs = require("fs");
const mime = require("mime-types");
const connectDB = require("./config/db");

// ─── 1) Allowed origins ───────────────────────────────────────────────────────
const allowedOrigins = [
  "https://uaacaiinternational-api.onrender.com",
  "https://uaacaiinternational.org",
  "http://localhost:5173",
];

// ─── 2) CORS options for uploads ───────────────────────────────────────────────
const uploadCorsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"],
  exposedHeaders: ["Accept-Ranges", "Content-Range", "Content-Length"],
};

const app = express();

// ─── 3) Security & Proxy ───────────────────────────────────────────────────────
app.disable("x-powered-by");
app.set("trust proxy", true);

// ─── 4) Helmet + CSP ──────────────────────────────────────────────────────────
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

// ─── 5) Ensure uploads directory exists ────────────────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadDir}`);
}

// ─── 6) Global CORS (for your API routes) ────────────────────────────────────
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── 7) Body parsing & DB connection ─────────────────────────────────────────
app.use(express.json());
connectDB(); // ← make sure your config/db.js logs success/failure

// ─── 8) Mount your API routes ─────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/posts", require("./routes/blogPostRoutes"));
app.use("/api/comments", require("./routes/commentRoutes"));
app.use("/api/dashboard-summary", require("./routes/dashboardRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));

// ─── 9) CORS preflight for uploads ─────────────────────────────────────────────
app.options("/uploads/*path", cors(uploadCorsOptions));

// ─── 10) Serve uploads with CORS + video/image cache logic ───────────────────
app.use(
  "/uploads",
  cors(uploadCorsOptions),
  express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      const contentType = mime.lookup(filePath) || "";

      if (contentType.startsWith("video/")) {
        // videos: cache 1 hour
        res.setHeader("Cache-Control", "public, max-age=3600");
      } else if (contentType.startsWith("image/")) {
        // images: cache 1 day
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        // others: default
        res.setHeader("Cache-Control", "public, max-age=3600");
      }

      // expose range headers so <video> can partial-load
      res.setHeader(
        "Access-Control-Expose-Headers",
        uploadCorsOptions.exposedHeaders.join(",")
      );
    },
  })
);

// ─── 11) Root, 404 & error handlers ────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("✅ UAACAI API is up and running. Visit /api/* for endpoints.");
});

app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// ─── 12) Start the server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
