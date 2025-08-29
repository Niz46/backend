// scripts/migrate-mongo-to-postgres.js
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const prisma = require("../config/prisma");

const mongoUri = process.env.MONGO_URL;
if (!mongoUri) {
  console.error("MONGO_URL missing in .env");
  process.exit(1);
}

async function run() {
  const mongo = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await prisma.$connect();

  try {
    await mongo.connect();
    console.log("Connected to Mongo");

    const db = mongo.db(); // default DB in connection string
    const userMap = {}; // mongoId -> prismaId
    const postMap = {}; // mongoId -> prismaId
    const commentMap = {}; // mongoCommentId -> prismaCommentId
    const tagMap = {}; // tagName -> prismaTagId

    // 1) Users
    const mongoUsers = await db.collection("users").find().toArray();
    console.log("Users to migrate:", mongoUsers.length);

    for (const u of mongoUsers) {
      // skip if already exists by email
      const existing = await prisma.user.findUnique({
        where: { email: u.email },
      });
      if (existing) {
        userMap[u._id.toString()] = existing.id;
        continue;
      }

      const created = await prisma.user.create({
        data: {
          name: u.name || "Unnamed",
          email: u.email,
          password: u.password || "", // keep hashed password
          profileImageUrl: u.profileImageUrl || null,
          bio: u.bio || null,
          role: u.role || "member",
        },
      });
      userMap[u._id.toString()] = created.id;
    }

    // 2) Tags: we'll create on-the-fly during posts, but preload unique tags if you prefer
    // 3) Posts
    const mongoPosts = await db.collection("blogposts").find().toArray();
    console.log("Posts to migrate:", mongoPosts.length);

    for (const p of mongoPosts) {
      // skip if it already exists by slug
      const existing = await prisma.blogPost
        .findUnique({ where: { slug: p.slug } })
        .catch(() => null);
      if (existing) {
        postMap[p._id.toString()] = existing.id;
        continue;
      }

      const authorId = p.author ? userMap[p.author.toString()] : null;
      const createdPost = await prisma.blogPost.create({
        data: {
          title: p.title || "Untitled",
          slug:
            p.slug ||
            (p.title || "untitled").toLowerCase().replace(/\s+/g, "-"),
          content: p.content || "",
          coverImageUrl: Array.isArray(p.coverImageUrl)
            ? p.coverImageUrl
            : p.coverImageUrl
              ? [p.coverImageUrl]
              : [],
          coverVideoUrl: Array.isArray(p.coverVideoUrl)
            ? p.coverVideoUrl
            : p.coverVideoUrl
              ? [p.coverVideoUrl]
              : [],
          isDraft: !!p.isDraft,
          generatedByAI: !!p.generatedByAI,
          views: p.views || 0,
          likesCount: Array.isArray(p.likedBy)
            ? p.likedBy.length
            : p.likes || 0,
          author: authorId ? { connect: { id: authorId } } : undefined,
        },
      });

      postMap[p._id.toString()] = createdPost.id;

      // Create Tag rows and PostTag links
      const tags = Array.isArray(p.tags)
        ? p.tags.map((t) => String(t).trim()).filter(Boolean)
        : [];
      for (const tagName of tags) {
        if (!tagMap[tagName]) {
          // try find existing
          const existingTag = await prisma.tag
            .findUnique({ where: { name: tagName } })
            .catch(() => null);
          if (existingTag) {
            tagMap[tagName] = existingTag.id;
          } else {
            const createdTag = await prisma.tag.create({
              data: { name: tagName },
            });
            tagMap[tagName] = createdTag.id;
          }
        }

        // create PostTag (skip duplicate)
        const already = await prisma.postTag.findFirst({
          where: { postId: createdPost.id, tagId: tagMap[tagName] },
        });
        if (!already) {
          await prisma.postTag.create({
            data: {
              post: { connect: { id: createdPost.id } },
              tag: { connect: { id: tagMap[tagName] } },
            },
          });
        }
      }
    }

    // 4) Comments: create without parentId first
    const mongoComments = await db.collection("comments").find().toArray();
    console.log("Comments to migrate:", mongoComments.length);

    for (const c of mongoComments) {
      // skip if exists? We can't reliably dedupe, so use a simple heuristic: same content + author + post + createdAt
      const authorId = c.author ? userMap[c.author.toString()] : null;
      const postId = c.post ? postMap[c.post.toString()] : null;
      const created = await prisma.comment
        .create({
          data: {
            content: c.content || "",
            author: authorId ? { connect: { id: authorId } } : undefined,
            post: postId ? { connect: { id: postId } } : undefined,
            // leave parentId null for now; we'll update in pass 2
            createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
          },
        })
        .catch((err) => {
          console.error("Failed creating comment (skipping)", err);
          return null;
        });

      if (created) {
        commentMap[c._id.toString()] = created.id;
      }
    }

    // 5) Second pass: set parentId for comments
    for (const c of mongoComments) {
      if (c.parentComment) {
        const newId = commentMap[c._id.toString()];
        const parentNewId = commentMap[c.parentComment.toString()];
        if (newId && parentNewId) {
          await prisma.comment
            .update({ where: { id: newId }, data: { parentId: parentNewId } })
            .catch((err) => {
              console.warn(
                "Failed to set parent for comment",
                c._id.toString(),
                err
              );
            });
        }
      }
    }

    // 6) Likes: create PostLike rows
    console.log("Migrating likes for posts...");
    for (const p of mongoPosts) {
      const pgPostId = postMap[p._id.toString()];
      if (!pgPostId) continue;
      const likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
      for (const mid of likedBy) {
        const pgUserId = userMap[mid.toString()];
        if (!pgUserId) continue;
        // create PostLike if not exists
        const exists = await prisma.postLike.findFirst({
          where: { userId: pgUserId, postId: pgPostId },
        });
        if (!exists) {
          await prisma.postLike
            .create({
              data: {
                user: { connect: { id: pgUserId } },
                post: { connect: { id: pgPostId } },
              },
            })
            .catch((err) => {
              console.warn(
                "Failed creating PostLike",
                { pgUserId, pgPostId },
                err.message
              );
            });
        }
      }
      // ensure likesCount matches
      const likesCount = likedBy.length;
      await prisma.blogPost
        .update({ where: { id: pgPostId }, data: { likesCount } })
        .catch(() => null);
    }

    console.log("Migration completed.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    try {
      await mongo.close();
    } catch (e) {}
    await prisma.$disconnect();
    process.exit(0);
  }
}

run();
