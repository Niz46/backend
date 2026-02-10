// config/prisma.js
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  // logging useful during development; reduce in production
  log: ["error", "warn", "info"],
});

// Capture some runtime events (optional, helpful while developing)
prisma.$on("info", (e) => {
  console.log("Prisma info:", e.message);
});
prisma.$on("warn", (e) => {
  console.warn("Prisma warn:", e.message);
});
prisma.$on("error", (e) => {
  console.error("Prisma error:", e.message);
});

// Export the client only
module.exports = prisma;
