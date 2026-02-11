// backend/controllers/blogPostController.js
const prisma = require("../config/prisma");
const slugify = require("slugify");
const agenda = require("../config/agenda");

/**
 * Helper: pick first usable media url from a variety of possible inputs
 * Accepts undefined, string, array, or cloudinary-style object { secure_url, url, public_id }
 */
const pickFirstMediaUrl = (val) => {
  if (!val) return null;

  // If array: pick first truthy element
  if (Array.isArray(val)) {
    const first = val.find(Boolean);
    if (!first) return null;
    return pickFirstMediaUrl(first);
  }

  // If an object returned from cloudinary uploader
  if (typeof val === "object") {
    return val.secure_url || val.url || val.public_url || null;
  }

  // string
  if (typeof val === "string") {
    return val;
  }

  return null;
};

/**
 * normalizeArray - ensures value becomes an array (of strings/objects) or [].
 * Handles: undefined/null, arrays, JSON-stringified arrays, comma-separated strings,
 * single string, objects (returned as single-item array).
 */
const normalizeArray = (val) => {
  if (val === undefined || val === null) return [];

  // Already an array -> filter out falsy
  if (Array.isArray(val)) {
    return val
      .map((v) => (v === null || v === undefined ? null : v))
      .filter(Boolean);
  }

  // Object -> return as single-element array
  if (typeof val === "object") {
    return [val];
  }

  // String -> try JSON parse for JSON-encoded arrays first
  if (typeof val === "string") {
    const raw = val.trim();
    if (/^\[.*\]$/.test(raw)) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((v) => (v === null || v === undefined ? null : v))
            .filter(Boolean);
        }
      } catch (e) {
        // ignore and fallback to comma split
      }
    }

    // comma-separated
    if (raw.includes(",")) {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // single string
    return [raw];
  }

  // Fallback coerce to string
  return [String(val)];
};

/**
 * normalizeTags - ensures tags become an array of trimmed strings
 * Accepts: array, JSON stringified array, comma-separated string, or single string
 */
const normalizeTags = (val) => {
  if (!val && val !== 0) return [];
  if (Array.isArray(val)) {
    return val.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const raw = val.trim();
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
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [String(val).trim()].filter(Boolean);
};

/**
 * normalizeMediaArrayForResponse - ensure response always contains arrays for media fields
 * Returns an array of normalized URLs (strings) or [].
 */
const normalizeMediaArrayForResponse = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((item) => pickFirstMediaUrl(item)).filter(Boolean);
  }
  // single value -> try to pick and return single-item array
  const single = pickFirstMediaUrl(val);
  return single ? [single] : [];
};

/**
 * Helper to map the Post with postTags -> tags array and normalize media URLs / author image
 * Ensures coverImageUrl and coverVideoUrl are arrays in the response.
 */
const mapPostResponse = (post) => {
  const tags = (post.postTags || []).map((pt) => pt.tag?.name).filter(Boolean);
  const { postTags, ...rest } = post;

  const normalized = {
    ...rest,
    tags,
    // ensure response shape: coverImageUrl and coverVideoUrl are arrays
    coverImageUrl: normalizeMediaArrayForResponse(rest.coverImageUrl),
    coverVideoUrl: normalizeMediaArrayForResponse(rest.coverVideoUrl),
    // ensure author exists and its profile image normalized to single string (or null)
    author: {
      ...(rest.author || {}),
      profileImageUrl: pickFirstMediaUrl(rest.author?.profileImageUrl),
    },
  };

  return normalized;
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
    const authorId = req.user && req.user.id;

    if (!authorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!title || !content) {
      return res.status(400).json({ message: "Missing fields" });
    }

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
    const param = req.params.id;

    // Try find by id first
    let post = null;
    try {
      post = await prisma.blogPost.findUnique({ where: { id: param } });
    } catch (e) {
      post = null;
    }

    // If not found by id, try slug
    if (!post) {
      post = await prisma.blogPost.findUnique({ where: { slug: param } });
    }

    if (!post) return res.status(404).json({ message: "Post not found" });

    await prisma.$transaction([
      prisma.postTag.deleteMany({ where: { postId: post.id } }),
      prisma.postLike.deleteMany({ where: { postId: post.id } }),
      prisma.comment.deleteMany({ where: { postId: post.id } }),
      prisma.blogPost.delete({ where: { id: post.id } }),
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
