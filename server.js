// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const fs = require("fs");
const mime = require("mime-types");

const prisma = require("./config/prisma"); // ← Prisma client
require("./jobs/emailJobs"); // Agenda job definitions that rely on MONGO_URL

const agenda = require("./config/agenda");

const startAgenda = async () => {
  try {
    await agenda.start();
    console.log("✅ Agenda scheduler started");
  } catch (err) {
    console.error("Failed to start Agenda:", err);
  }
};

(async function init() {
  // Connect Prisma early so connection issues show up at boot
  try {
    await prisma.$connect();
    console.log("✅ Prisma connected to DATABASE_URL");
  } catch (err) {
    console.error("❌ Prisma connection error:", err);
    // We don't exit here to allow Agenda jobs still to work (if that's desired).
    // Optionally: process.exit(1);
  }

  // Start Agenda (it uses process.env.MONGO_URL)
  await startAgenda();
})();

// ─── 1) Allowed origins ───────────────────────────────────────────────────────
const allowedOrigins = [
  "https://uaacaiinternational-api-6zzt.onrender.com",
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

// ─── 7) Body parsing (Prisma does not require a separate connect call) ───────
app.use(express.json());
// previously: connectDB(); // removed - Prisma handles DB connections

// ─── 8) Mount your API routes ─────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/posts", require("./routes/blogPostRoutes"));
app.use("/api/comments", require("./routes/commentRoutes"));
app.use("/api/dashboard-summary", require("./routes/dashboardRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

// ─── 9) CORS preflight for uploads ─────────────────────────────────────────────
app.options("/uploads/*path", cors(uploadCorsOptions));

// ─── 10) Serve uploads with CORS + video/image cache logic ───────────────────
app.use(
  "/uploads",
  cors(uploadCorsOptions),
  express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      const contentType = mime.lookup(filePath) || "";

      // 1) Manually re‐add the ACAO header (echo origin when available)
      res.setHeader(
        "Access-Control-Allow-Origin",
        res.req.headers.origin || allowedOrigins[0]
      );

      // 2) Cache headers
      if (contentType.startsWith("video/")) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      } else if (contentType.startsWith("image/")) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }

      // 3) Expose range headers
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
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  try {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(() => console.log("HTTP server closed."));
    try {
      await agenda.stop();
      console.log("Agenda stopped.");
    } catch (err) {
      console.warn("Error stopping Agenda:", err);
    }
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected.");
    } catch (err) {
      console.warn("Error disconnecting Prisma:", err);
    }
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
