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

// 1. Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadDir}`);
}

// 2. Trust proxy for correct req.protocol
app.set("trust proxy", true);

// 3. Global CORS (including OPTIONS & HEAD)
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
app.options("*", cors()); // handle pre‑flight requests

// 4. Body parser & DB
app.use(express.json());
connectDB();

// 5. API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", blogPostRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard-summary", dashboardRoutes);
app.use("/api/ai", aiRoutes);

// 6. Serve uploads with CORS
app.use("/uploads", express.static(uploadDir));

// 7. Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// 8. Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
