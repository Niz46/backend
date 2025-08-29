// backend/config/prisma.js
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["error", "warn"], // enable during dev; remove or adjust in prod
});

module.exports = prisma;
