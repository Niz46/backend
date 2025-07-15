// server.js (or app.js)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet"); // ← install helmet
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const blogPostRoutes = require("./routes/blogPostRoutes");
const commentRoutes = require("./routes/commentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();

// CORS (your existing whitelist)
const allowedOrigins = [
  "https://backend-mu6d.onrender.com",
  "https://uaacaiinternational.org",
  "http://localhost:5173",
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked from ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Helmet with a CSP that allows data: URIs for images
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // allow scripts/styles from self
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // allow images from your domain *and* inline (data:)
        imgSrc: ["'self'", "data:", "https://backend-mu6d.onrender.com"],
        VideoSrc: ["'self'", "data:", "https://backend-mu6d.onrender.com"], // allow inline videos
        // optional: fonts/icons from self or any CDN you use
        fontSrc: ["'self'" /* other font hosts... */],
        connectSrc: ["'self'", "https://backend-mu6d.onrender.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

// body parser, DB, static, routes...
app.use(express.json());
connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/posts", blogPostRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard-summary", dashboardRoutes);
app.use("/api/ai", aiRoutes);

// serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
