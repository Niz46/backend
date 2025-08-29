// config/prisma.js
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  // enable logging that helps during development/diagnosis.
  // Keep 'error' and 'warn' in production; add 'info' during debugging.
  log: ["error", "warn", "info"],
  // If you want even more tracing, you can add query logging in dev:
  // log: ["query", "info", "warn", "error"],
});

// Capture Prisma runtime events (useful for debugging)
prisma.$on("info", (e) => {
  console.log("Prisma info:", e.message);
});
prisma.$on("warn", (e) => {
  console.warn("Prisma warn:", e.message);
});
prisma.$on("error", (e) => {
  console.error("Prisma error:", e.message);
});
prisma.$on("query", (e) => {
  // Comment out in production unless you need query traces (very noisy).
  // console.log(`Prisma query ${e.query} params:${e.params}`);
});

module.exports = prisma;
