// scripts/clear-db.js
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing database...");

  // delete dependent tables first
  await prisma.$transaction([
    prisma.postLike.deleteMany(),
    prisma.postTag.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.blogPost.deleteMany(),
    // tags and users last (if you want to keep users, remove the line below)
    prisma.tag.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("All data deleted.");
}

main()
  .catch((e) => {
    console.error("Failed to clear DB:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
