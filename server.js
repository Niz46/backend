// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const blogPostRoutes = require("./routes/blogPostRoutes");
const commentRoutes = require("./routes/commentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();

// ---- GLOBAL NO‑CACHE HEADERS ----
app.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});

// ---- CORS WHITELIST ----
const allowedOrigins = [
  "https://backend‑mu6d.onrender.com",
  "https://uaacaiinternational.org",
  "http://localhost:5173",
  /\.vercel\.app$/, // allow all *.vercel.app preview URLs
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const ok = allowedOrigins.some((o) =>
        typeof o === "string"
          ? o === origin
          : o instanceof RegExp && o.test(origin)
      );
      if (ok) return callback(null, true);
      callback(new Error(`CORS policy blocked access from ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ---- DB + JSON ----
connectDB();
app.use(express.json());

// ---- ROUTES ----
app.use("/api/auth", authRoutes);
app.use("/api/posts", blogPostRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard-summary", dashboardRoutes);
app.use("/api/ai", aiRoutes);

// ---- SERVE UPLOADS ----
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
