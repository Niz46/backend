// prisma/seed.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const prisma = require("../config/prisma"); // your project's prisma client

const BLOG_POSTS_PATH = path.join(__dirname, "seedData", "blogPosts.json");

async function loadPostsJson() {
  if (!fs.existsSync(BLOG_POSTS_PATH)) {
    throw new Error(`Missing ${BLOG_POSTS_PATH}. Create it with sample posts.`);
  }
  const raw = fs.readFileSync(BLOG_POSTS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function findOrCreateAuthor(email) {
  if (!email) {
    // fallback author if JSON lacks authorEmail
    email = "seed-author@uaacai.org";
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) return user;

  console.log(`ℹ️ Author not found for ${email}. Creating placeholder user.`);
  user = await prisma.user.create({
    data: {
      name: email.split("@")[0],
      email,
      password: "seed-password", // NOTE: plaintext for seed; hash in production if needed
      role: "member",
    },
  });
  return user;
}

/**
 * Upsert a post inside an interactive transaction.
 * Note: tagIds should be pre-computed and passed in (so we don't upsert tags inside the tx).
 */
async function upsertPost(tx, postObj, authorId, tagIds = []) {
  const slug = slugify(postObj.title, { lower: true, strict: true });

  const upserted = await tx.blogPost.upsert({
    where: { slug },
    update: {
      title: postObj.title,
      content: postObj.content,
      coverImageUrl: postObj.coverImageUrl || [],
      coverVideoUrl: postObj.coverVideoUrl || [],
      isDraft: Boolean(postObj.isDraft),
      generatedByAI: Boolean(postObj.generatedByAI),
      authorId: authorId,
    },
    create: {
      title: postObj.title,
      slug,
      content: postObj.content,
      coverImageUrl: postObj.coverImageUrl || [],
      coverVideoUrl: postObj.coverVideoUrl || [],
      isDraft: Boolean(postObj.isDraft),
      generatedByAI: Boolean(postObj.generatedByAI),
      author: { connect: { id: authorId } },
    },
  });

  // Replace postTags deterministically: delete existing and bulk-insert new ones.
  await tx.postTag.deleteMany({ where: { postId: upserted.id } });

  if (Array.isArray(tagIds) && tagIds.length > 0) {
    const data = tagIds.map((tid) => ({ postId: upserted.id, tagId: tid }));
    // createMany + skipDuplicates reduces round-trips and avoids duplicate-key failures
    await tx.postTag.createMany({ data, skipDuplicates: true });
  }

  return upserted;
}

async function seed() {
  console.log("🔁 Starting blog posts seeding...");

  try {
    const posts = await loadPostsJson();
    if (!Array.isArray(posts) || posts.length === 0) {
      console.log("No posts in JSON — nothing to seed.");
      return;
    }

    // --- PRE-UPsert ALL TAGS (outside per-post transactions) ---
    const allTagNames = new Set();
    for (const p of posts) {
      const tagNames = Array.isArray(p.tags) ? p.tags : [];
      for (const t of tagNames) {
        if (t && typeof t === "string") allTagNames.add(t);
      }
    }

    const tagMap = new Map(); // name -> id
    if (allTagNames.size > 0) {
      console.log(`ℹ️ Upserting ${allTagNames.size} unique tags...`);
      for (const name of allTagNames) {
        const tag = await prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        tagMap.set(name, tag.id);
      }
      console.log("✅ Tags upserted.");
    }

    // --- PROCESS POSTS (short per-post transactions) ---
    for (const p of posts) {
      const authorEmail = p.authorEmail || null;
      const author = await findOrCreateAuthor(authorEmail);

      // Build list of tag IDs for this post using the pre-upserted tagMap
      const tagIds = (Array.isArray(p.tags) ? p.tags : [])
        .map((t) => tagMap.get(t))
        .filter(Boolean);

      // Run a short transaction: upsert the post and create postTag rows in bulk.
      // Increase the timeout a bit to avoid the default 5s expiring on slower environments.
      const result = await prisma.$transaction(
        async (tx) => {
          return upsertPost(tx, p, author.id, tagIds);
        },
        {
          timeout: 30_000, // 30s interactive transaction timeout
          maxWait: 10_000, // optional: wait up to 10s to acquire resources
        }
      );

      console.log(
        `  ➕ Upserted post: "${result.title}" (slug: ${result.slug})`
      );
    }

    console.log("🎉 Blog posts seeding completed.");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
