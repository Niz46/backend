// server.js

require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const connectDB = require("./config/db");

const authRoutes      = require("./routes/authRoutes");
const blogPostRoutes  = require("./routes/blogPostRoutes");
const commentRoutes   = require("./routes/commentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const aiRoutes        = require("./routes/aiRoutes");

const app = express();

// ─── Security & Proxy ─────────────────────────────────────────────────────────
// Disable the X‑Powered‑By header
app.disable("x-powered-by");

// If you’re behind a proxy (e.g. Render), ensure correct protocol resolution
app.set("trust proxy", true);

// ─── Ensure Uploads Directory ─────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadDir}`);
}

// ─── CORS Configuration ────────────────────────────────────────────────────────
const allowedOrigins = [
  "https://backend-mu6d.onrender.com",
  "https://uaacaiinternational.org",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body Parsing & Database ───────────────────────────────────────────────────
app.use(express.json());
connectDB();

// ─── API Route Mounting ───────────────────────────────────────────────────────
app.use("/api/auth",            authRoutes);
app.use("/api/posts",           blogPostRoutes);
app.use("/api/comments",        commentRoutes);
app.use("/api/dashboard-summary", dashboardRoutes);
app.use("/api/ai",              aiRoutes);

// ─── Static Assets (Uploads) ───────────────────────────────────────────────────
// Wrap in its own CORS so every file response carries the header
app.use(
  "/uploads",
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "OPTIONS"],
  }),
  express.static(uploadDir)
);

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
