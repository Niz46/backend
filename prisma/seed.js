// prisma/seed.js
/**
 * Complete seed script (JavaScript)
 *
 * Purpose:
 *  - Preserve existing scalar-list (string[]) columns unless seed JSON explicitly provides values.
 *  - Use correct Prisma update syntax for scalar lists: { set: [...] }.
 *  - Defensive checks + helpful logging to avoid accidental overwrites.
 *
 * Usage:
 *  1. npx prisma generate
 *  2. node prisma/seed.js
 *
 * Notes:
 *  - This script expects a JSON file at prisma/seedData/blogPosts.json (array of post objects).
 *  - Your Prisma client is expected to be exported from ../config/prisma (as in your repo).
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const prisma = require("../config/prisma"); // adjust if your path differs

const BLOG_POSTS_PATH = path.join(__dirname, "seedData", "blogPosts.json");

/* ---------- Helpers ---------- */

function ensureArray(val) {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return [val];
  // if it's something else, don't coerce — return undefined so we won't touch DB
  return undefined;
}

async function loadPostsJson() {
  if (!fs.existsSync(BLOG_POSTS_PATH)) {
    throw new Error(`Missing ${BLOG_POSTS_PATH}. Create it with sample posts.`);
  }
  const raw = fs.readFileSync(BLOG_POSTS_PATH, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${BLOG_POSTS_PATH}: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${BLOG_POSTS_PATH} must be a JSON array.`);
  }
  // Minimal validation for expected fields
  return parsed.map((p, i) => {
    if (!p.title || typeof p.title !== "string") {
      throw new Error(`post at index ${i} is missing a valid 'title' field`);
    }
    // ensure tags is an array if present
    if (p.tags && !Array.isArray(p.tags)) {
      throw new Error(`post at index ${i} has invalid 'tags' (must be an array)`);
    }
    return p;
  });
}

async function findOrCreateAuthor(email) {
  if (!email) email = "seed-author@uaacai.org";

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) return user;

  console.log(`ℹ️ Author not found for ${email}. Creating placeholder user.`);
  user = await prisma.user.create({
    data: {
      name: email.split("@")[0],
      email,
      password: "seed-password", // plaintext for seed; replace or hash in real envs
      role: "member",
    },
  });
  return user;
}

/**
 * Upsert a BlogPost within a transaction (tx).
 * - If postObj.coverImageUrl / coverVideoUrl are provided (arrays), we WILL set them using { set: [...] }.
 * - If they are omitted, we do NOT touch those DB columns during update (preserves existing images).
 */
async function upsertPost(tx, postObj, authorId, tagIds = []) {
  const slug = slugify(postObj.title, { lower: true, strict: true });

  const coverImages = ensureArray(postObj.coverImageUrl);
  const coverVideos = ensureArray(postObj.coverVideoUrl);

  // Build update object carefully: only include list updates when explicitly provided
  const updateData = {
    title: postObj.title,
    content: postObj.content,
    isDraft: Boolean(postObj.isDraft),
    generatedByAI: Boolean(postObj.generatedByAI),
    authorId: authorId,
    // other scalar fields you want to update can be added here
  };
  if (coverImages !== undefined) {
    // Prisma requires { set: [...] } when updating scalar lists
    updateData.coverImageUrl = { set: coverImages };
  }
  if (coverVideos !== undefined) {
    updateData.coverVideoUrl = { set: coverVideos };
  }

  const createData = {
    title: postObj.title,
    slug,
    content: postObj.content,
    coverImageUrl: coverImages ?? [],
    coverVideoUrl: coverVideos ?? [],
    isDraft: Boolean(postObj.isDraft),
    generatedByAI: Boolean(postObj.generatedByAI),
    author: { connect: { id: authorId } },
  };

  console.log(`🔁 Upserting post slug="${slug}" (authorId=${authorId})`);
  if (coverImages !== undefined) {
    console.log(`   coverImageUrl -> will be set to: ${JSON.stringify(coverImages)}`);
  } else {
    console.log(`   coverImageUrl -> NOT provided in JSON; will not be changed on update.`);
  }
  if (coverVideos !== undefined) {
    console.log(`   coverVideoUrl -> will be set to: ${JSON.stringify(coverVideos)}`);
  } else {
    console.log(`   coverVideoUrl -> NOT provided in JSON; will not be changed on update.`);
  }

  const upserted = await tx.blogPost.upsert({
    where: { slug },
    update: updateData,
    create: createData,
  });

  // Replace postTags deterministically: delete existing and bulk-insert new ones.
  await tx.postTag.deleteMany({ where: { postId: upserted.id } });

  if (Array.isArray(tagIds) && tagIds.length > 0) {
    const data = tagIds.map((tid) => ({ postId: upserted.id, tagId: tid }));
    await tx.postTag.createMany({ data, skipDuplicates: true });
  }

  return upserted;
}

/* ---------- Main seeding flow ---------- */

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

      console.log(`  ➕ Upserted post: "${result.title}" (slug: ${result.slug})`);
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
