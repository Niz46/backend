// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const blogPostRoutes = require("./routes/blogPostRoutes");
const commentRoutes = require("./routes/commentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();

// ────────────────────────────────────────────────────────────────────────────────
// Disable the X‑Powered‑By header for security
app.disable("x-powered-by");

// 1. Ensure `uploads/` directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadDir}`);
}

// 2. Trust proxy (for correct req.protocol behind load‑balancers, proxies, etc.)
app.set("trust proxy", true);

// 3. Global CORS configuration (allowing pre‑flights)
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

// Explicitly handle all OPTIONS pre‑flight requests
app.options("*", cors());

// 4. Body parser & Database connection
app.use(express.json());
connectDB();

// 5. Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", blogPostRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard-summary", dashboardRoutes);
app.use("/api/ai", aiRoutes);

// 6. Serve uploads folder with its own CORS wrapper
app.use(
  "/uploads",
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "PUT", "OPTIONS"],
  }),
  express.static(uploadDir)
);

// 7. Global error handler (must come after all routes)
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// 8. Start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
