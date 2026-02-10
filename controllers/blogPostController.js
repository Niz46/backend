// backend/controllers/blogPostController.js
const prisma = require("../config/prisma");
const slugify = require("slugify");
const agenda = require("../config/agenda");

/**
 * Helper to map the Post with postTags -> tags array
 */
const mapPostResponse = (post) => {
  const tags = (post.postTags || []).map((pt) => pt.tag?.name).filter(Boolean);
  const { postTags, ...rest } = post;
  return { ...rest, tags };
};

/**
 * Helper to surface DB connectivity issues clearly
 */
const handlePrismaError = (res, err, fallbackMessage = "Server error") => {
  console.error("Prisma error:", err);
  if (err && err.code === "P1001") {
    // Can't reach DB
    return res.status(503).json({
      message: "Database unreachable. Please check DATABASE_URL and network.",
      err: err.message,
    });
  }
  return res.status(500).json({ message: fallbackMessage, err: err.message });
};

// CREATE
const createPost = async (req, res) => {
  try {
    const {
      title,
      content,
      tags = [],
      isDraft = false,
      generatedByAI = false,
    } = req.body;
    const authorId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // --- helpers to normalize incoming fields ---
    const normalizeArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      // if client sent JSON stringified array
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // not JSON — fall back to string handling below
      }
      return [String(val)];
    };

    const normalizeTags = (val) => {
      // Accepts: array, JSON stringified array, comma-separated string, or single string
      if (!val) return [];
      if (Array.isArray(val)) {
        return val.map((t) => String(t).trim()).filter(Boolean);
      }
      if (typeof val === "string") {
        const raw = val.trim();
        // try JSON parse first
        if (/^\[.*\]$/.test(raw)) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              return parsed.map((t) => String(t).trim()).filter(Boolean);
            }
          } catch (e) {
            // ignore and fallback to comma split
          }
        }
        // fallback: comma separated list
        return raw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      // otherwise coerce
      return [String(val).trim()].filter(Boolean);
    };

    // Normalize incoming cover arrays (middleware may already have attached arrays of Cloudinary URLs)
    const coverImageUrl = normalizeArray(req.body.coverImageUrl);
    const coverVideoUrl = normalizeArray(req.body.coverVideoUrl);

    // Normalize tags (ensures array of trimmed strings)
    const finalTags = normalizeTags(tags);

    // Create a unique slug for the title. If slug exists, append a short suffix.
    const baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    // Ensure slug uniqueness (simple loop with timestamp suffix if needed)
    // Note: small race condition possible in highly concurrent writes — acceptable for most apps.
    let suffixCounter = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await prisma.blogPost.findUnique({ where: { slug } });
      if (!existing) break;
      suffixCounter += 1;
      // include a time-based part to minimize collisions
      slug = `${baseSlug}-${Date.now().toString(36)}-${suffixCounter}`;
    }

    const created = await prisma.blogPost.create({
      data: {
        title,
        slug,
        content,
        coverImageUrl, // already normalized array
        coverVideoUrl, // already normalized array
        isDraft: Boolean(isDraft),
        generatedByAI: Boolean(generatedByAI),
        author: { connect: { id: authorId } },
        postTags: {
          create: finalTags.map((t) => ({
            tag: {
              connectOrCreate: {
                where: { name: t },
                create: { name: t },
              },
            },
          })),
        },
      },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });

    const post = mapPostResponse(created);

    // notify members (optional) — don't fail create if notify fails
    try {
      const subscribers = await prisma.user.findMany({
        where: { role: "member" },
        select: { email: true },
      });
      await agenda.now("broadcast-new-post", {
        emails: subscribers.map((s) => s.email),
        postTitle: post.title,
        postUrl: `${process.env.FRONTEND_URL}/posts/${post.slug}`,
      });
    } catch (notifyErr) {
      console.error("notify subscribers failed:", notifyErr);
      // intentionally swallow notification errors
    }

    return res.status(201).json(post);
  } catch (err) {
    return handlePrismaError(res, err, "Failed to create post");
  }
};

// UPDATE
const updatePost = async (req, res) => {
  try {
    const id = req.params.id;
    const payload = { ...req.body };

    if (payload.title)
      payload.slug = slugify(payload.title, { lower: true, strict: true });

    // If tags provided — replace them (simpler and predictable)
    if (payload.tags) {
      const newTags = payload.tags;
      delete payload.tags;

      // ensure post exists
      const exists = await prisma.blogPost.findUnique({ where: { id } });
      if (!exists) return res.status(404).json({ message: "Post not found" });

      // update scalars
      await prisma.blogPost.update({
        where: { id },
        data: payload,
      });

      // replace postTags in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.postTag.deleteMany({ where: { postId: id } });

        for (const tagName of newTags) {
          const tag = await tx.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName },
          });

          await tx.postTag.create({
            data: {
              post: { connect: { id } },
              tag: { connect: { id: tag.id } },
            },
          });
        }
      });

      const updated = await prisma.blogPost.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true, profileImageUrl: true } },
          postTags: { include: { tag: true } },
        },
      });

      return res.json(mapPostResponse(updated));
    }

    // normal update (no tags)
    const updated = await prisma.blogPost.update({
      where: { id },
      data: payload,
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });

    return res.json(mapPostResponse(updated));
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({ message: "Post not found" });
    }
    return handlePrismaError(res, err, "Failed to update post");
  }
};

// DELETE
const deletePost = async (req, res) => {
  try {
    const id = req.params.id;

    // Ensure post exists before deleting
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) return res.status(404).json({ message: "Post not found" });

    await prisma.$transaction([
      prisma.postTag.deleteMany({ where: { postId: id } }),
      prisma.postLike.deleteMany({ where: { postId: id } }),
      prisma.comment.deleteMany({ where: { postId: id } }),
      prisma.blogPost.delete({ where: { id } }),
    ]);

    return res.json({ message: "Deleted" });
  } catch (err) {
    if (err && err.code === "P2025") {
      return res.status(404).json({ message: "Post not found" });
    }
    return handlePrismaError(res, err, "Failed to delete post");
  }
};

// GET ALL (paginated)
const getAllPosts = async (req, res) => {
  try {
    const status = req.query.status || "published";
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "5", 10);
    const skip = (page - 1) * limit;

    const where =
      status === "draft"
        ? { isDraft: true }
        : status === "published"
          ? { isDraft: false }
          : {};

    const [postsRaw, totalCount, allCount, publishedCount, draftCount] =
      await Promise.all([
        prisma.blogPost.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          include: {
            author: { select: { id: true, name: true, profileImageUrl: true } },
            postTags: { include: { tag: true } },
          },
        }),
        prisma.blogPost.count({ where }),
        prisma.blogPost.count(),
        prisma.blogPost.count({ where: { isDraft: false } }),
        prisma.blogPost.count({ where: { isDraft: true } }),
      ]);

    const posts = postsRaw.map(mapPostResponse);

    return res.json({
      posts,
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      counts: { all: allCount, published: publishedCount, draft: draftCount },
    });
  } catch (err) {
    return handlePrismaError(res, err, "Failed to fetch posts");
  }
};

// GET BY SLUG
const getPostBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const postRaw = await prisma.blogPost.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });
    if (!postRaw) return res.status(404).json({ message: "Post not found" });

    let hasLiked = false;
    if (req.user && req.user.id) {
      const like = await prisma.postLike
        .findUnique({
          where: { userId_postId: { userId: req.user.id, postId: postRaw.id } },
        })
        .catch(() => null);
      hasLiked = !!like;
    }

    const post = mapPostResponse(postRaw);
    return res.json({ ...post, hasLiked });
  } catch (err) {
    return handlePrismaError(res, err, "Failed to get post");
  }
};

// incrementView
const incrementView = async (req, res) => {
  const param = req.params.id;
  if (!param) {
    return res.status(400).json({ message: "Missing post id or slug in URL" });
  }

  try {
    // Try to find by primary id first
    let post = null;
    try {
      post = await prisma.blogPost.findUnique({ where: { id: param } });
    } catch (e) {
      // If id param is not the right type for id column (e.g. numeric vs uuid),
      // ignore and try slug below.
      post = null;
    }

    // If not found by id, try searching by slug
    if (!post) {
      post = await prisma.blogPost.findUnique({ where: { slug: param } });
    }

    if (!post) {
      // clear, explicit 404 — do NOT call update() with a missing id
      return res.status(404).json({
        message: "Post not found for id or slug",
        lookedUp: param,
      });
    }

    // Perform atomic increment
    const updated = await prisma.blogPost.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
    });

    return res.json({ message: "View incremented", views: updated.views });
  } catch (err) {
    console.error("Failed to increment view:", err);
    return res
      .status(500)
      .json({ message: "Failed to increment view", err: String(err) });
  }
};

// likePost
const likePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = req.params.id;

    const already = await prisma.postLike
      .findUnique({ where: { userId_postId: { userId, postId } } })
      .catch(() => null);
    if (already) return res.status(200).json({ message: "Already liked" });

    await prisma.$transaction([
      prisma.postLike.create({
        data: {
          user: { connect: { id: userId } },
          post: { connect: { id: postId } },
        },
      }),
      prisma.blogPost.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    const updated = await prisma.blogPost.findUnique({ where: { id: postId } });
    return res.json({ message: "Like added", likes: updated.likesCount });
  } catch (err) {
    return handlePrismaError(res, err, "Failed to like post");
  }
};

// getTopPosts
const getTopPosts = async (req, res) => {
  try {
    const postsRaw = await prisma.blogPost.findMany({
      where: { isDraft: false },
      orderBy: [{ views: "desc" }, { likesCount: "desc" }],
      take: 5,
      include: { postTags: { include: { tag: true } } },
    });
    const posts = postsRaw.map(mapPostResponse).map((p) => ({
      id: p.id,
      title: p.title,
      coverImageUrl: p.coverImageUrl,
      views: p.views,
      likesCount: p.likesCount,
      slug: p.slug,
      tags: p.tags,
    }));
    return res.json(posts);
  } catch (err) {
    return handlePrismaError(res, err, "Failed to get top posts");
  }
};

// getPostsByTag
const getPostsByTag = async (req, res) => {
  try {
    const tagName = req.params.tag;
    const tag = await prisma.tag.findUnique({ where: { name: tagName } });
    if (!tag) return res.json([]);

    const postTags = await prisma.postTag.findMany({
      where: { tagId: tag.id },
      include: {
        post: {
          include: {
            author: { select: { id: true, name: true, profileImageUrl: true } },
            postTags: { include: { tag: true } },
          },
        },
      },
    });

    const posts = postTags
      .map((pt) => pt.post)
      .filter(Boolean)
      .reduce((acc, p) => {
        if (!acc.find((x) => x.id === p.id)) acc.push(p);
        return acc;
      }, [])
      .map(mapPostResponse);

    return res.json(posts);
  } catch (err) {
    return handlePrismaError(res, err, "Failed to get posts by tag");
  }
};

// searchPosts
const searchPosts = async (req, res) => {
  try {
    const q = req.query.q || "";
    const postsRaw = await prisma.blogPost.findMany({
      where: {
        isDraft: false,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });

    const posts = postsRaw.map(mapPostResponse);
    return res.json(posts);
  } catch (err) {
    return handlePrismaError(res, err, "Failed to search posts");
  }
};

module.exports = {
  createPost,
  updatePost,
  deletePost,
  getAllPosts,
  getPostBySlug,
  getPostsByTag,
  searchPosts,
  incrementView,
  likePost,
  getTopPosts,
};
