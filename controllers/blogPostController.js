// backend/controllers/blogPostController.js
const prisma = require("../config/prisma");
const slugify = require("slugify");
const agenda = require("../config/agenda");

/**
 * Helper: normalize a Prisma BlogPost object into the shape the frontend expects.
 * - Returns both `id` and `_id` for backward compatibility.
 * - Flattens postTags -> tags (array of tag names).
 * - Picks a primary cover image from coverImageUrl[] (or null).
 * - Serializes dates to ISO strings.
 */
function mapPostForClient(p) {
  if (!p) return null;

  const tags =
    Array.isArray(p.postTags) && p.postTags.length
      ? p.postTags.map((pt) => pt.tag && pt.tag.name).filter(Boolean)
      : [];

  const coverImageUrl =
    Array.isArray(p.coverImageUrl) && p.coverImageUrl.length
      ? p.coverImageUrl[0]
      : typeof p.coverImageUrl === "string"
        ? p.coverImageUrl
        : null;

  const coverVideoUrl =
    Array.isArray(p.coverVideoUrl) && p.coverVideoUrl.length
      ? p.coverVideoUrl[0]
      : typeof p.coverVideoUrl === "string"
        ? p.coverVideoUrl
        : null;

  return {
    id: p.id,
    _id: p.id, // keep for compatibility if frontend expects _id
    title: p.title,
    slug: p.slug,
    content: p.content,
    coverImageUrl,
    coverImageUrls: Array.isArray(p.coverImageUrl) ? p.coverImageUrl : [],
    coverVideoUrl,
    coverVideoUrls: Array.isArray(p.coverVideoUrl) ? p.coverVideoUrl : [],
    tags,
    author: p.author
      ? {
          id: p.author.id,
          name: p.author.name,
          profileImageUrl: p.author.profileImageUrl || null,
        }
      : null,
    views: p.views ?? 0,
    likesCount: p.likesCount ?? 0,
    generatedByAI: !!p.generatedByAI,
    isDraft: !!p.isDraft,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
  };
}

/* ========== Controllers ========== */

// Create a new blog post
const createPost = async (req, res) => {
  try {
    const {
      title,
      content,
      coverImageUrl = [],
      coverVideoUrl = [],
      tags = [],
      isDraft = false,
      generatedByAI = false,
    } = req.body;

    const authorId = req.user && req.user.id;
    if (!authorId) return res.status(401).json({ message: "Unauthorized" });

    if (!title || !content)
      return res.status(400).json({ message: "Missing fields" });

    const slug = slugify(title, { lower: true, strict: true });

    // Build postTags create payload: create PostTag entries with tag connectOrCreate
    const postTagCreates = Array.isArray(tags)
      ? tags.map((t) => ({
          tag: {
            connectOrCreate: {
              where: { name: t },
              create: { name: t },
            },
          },
        }))
      : [];

    const post = await prisma.blogPost.create({
      data: {
        title,
        slug,
        content,
        coverImageUrl,
        coverVideoUrl,
        isDraft,
        generatedByAI,
        author: { connect: { id: authorId } },
        postTags: { create: postTagCreates },
      },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });

    // Notify subscribers (non-blocking behavior is acceptable but we await to catch errors)
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
      console.error("createPost: subscribers notification failed:", notifyErr);
      // proceed — don't fail the request because of notification issues
    }

    res.status(201).json(mapPostForClient(post));
  } catch (err) {
    console.error("createPost:", err);
    res
      .status(500)
      .json({ message: "Failed to create post", err: err.message || err });
  }
};

// Update an existing post
const updatePost = async (req, res) => {
  try {
    const id = req.params.id;
    const payload = { ...req.body };

    if (payload.title) {
      payload.slug = slugify(payload.title, { lower: true, strict: true });
    }

    // If tags are provided, remove existing postTags for this post and recreate
    if (payload.tags) {
      const tags = Array.isArray(payload.tags) ? payload.tags : [];
      delete payload.tags;

      // Transaction: delete old PostTags, update post fields, then create new PostTags
      await prisma.$transaction(async (tx) => {
        await tx.postTag.deleteMany({ where: { postId: id } });

        // create new postTags
        const postTagCreates = tags.map((t) => ({
          tag: {
            connectOrCreate: {
              where: { name: t },
              create: { name: t },
            },
          },
        }));

        // update fields and create new postTags
        await tx.blogPost.update({
          where: { id },
          data: {
            ...payload,
            postTags: { create: postTagCreates },
          },
        });
      });

      const updated = await prisma.blogPost.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true, profileImageUrl: true } },
          postTags: { include: { tag: true } },
        },
      });

      return res.json(mapPostForClient(updated));
    }

    // No tags update path
    const updated = await prisma.blogPost.update({
      where: { id },
      data: payload,
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
      },
    });

    res.json(mapPostForClient(updated));
  } catch (err) {
    console.error("updatePost:", err);
    res
      .status(500)
      .json({ message: "Failed to update post", err: err.message || err });
  }
};

// Delete a blog post
const deletePost = async (req, res) => {
  try {
    const id = req.params.id;

    // cascade behavior: delete PostTag and PostLike entries if necessary via DB cascade or manual deletes.
    // Attempt to delete post directly; Prisma will fail if there are FK constraints without cascade.
    await prisma.blogPost.delete({ where: { id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("deletePost:", err);
    res
      .status(500)
      .json({ message: "Failed to delete post", err: err.message || err });
  }
};

// Get blog posts by status (all, published, or draft) with counts
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

    const posts = postsRaw.map(mapPostForClient);

    res.json({
      posts,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
      counts: { all: allCount, published: publishedCount, draft: draftCount },
    });
  } catch (err) {
    console.error("getAllPosts:", err);
    res.status(500).json({ message: "Server Error", err: err.message || err });
  }
};

// Get a single blog post by slug
const getPostBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const post = await prisma.blogPost.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        postTags: { include: { tag: true } },
        comments: true,
        likes: true,
      },
    });
    if (!post) return res.status(404).json({ message: "Post not found" });

    // determine if current user liked
    let hasLiked = false;
    if (req.user && req.user.id) {
      const like = await prisma.postLike
        .findUnique({
          where: { userId_postId: { userId: req.user.id, postId: post.id } },
        })
        .catch(() => null);
      hasLiked = !!like;
    }

    res.json({ ...mapPostForClient(post), hasLiked });
  } catch (err) {
    console.error("getPostBySlug:", err);
    res
      .status(500)
      .json({ message: "Failed to get post", err: err.message || err });
  }
};

// Increment view count
const incrementView = async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.blogPost.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
    res.json({ message: "View count incremented" });
  } catch (err) {
    console.error("incrementView:", err);
    res
      .status(500)
      .json({
        message: "Failed to increment view count",
        err: err.message || err,
      });
  }
};

// Like a post
const likePost = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const postId = req.params.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // create PostLike if not exists
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

    const updated = await prisma.blogPost.findUnique({
      where: { id: postId },
      select: { likesCount: true },
    });

    res.json({
      message: "Like added",
      likes: updated ? updated.likesCount : 0,
    });
  } catch (err) {
    console.error("likePost:", err);
    res
      .status(500)
      .json({ message: "Failed to like post", error: err.message || err });
  }
};

// Get top trending posts
const getTopPosts = async (req, res) => {
  try {
    const postsRaw = await prisma.blogPost.findMany({
      where: { isDraft: false },
      orderBy: [{ views: "desc" }, { likesCount: "desc" }],
      take: 5,
      include: { postTags: { include: { tag: true } } },
    });

    const posts = postsRaw.map((p) => {
      const m = mapPostForClient(p);
      return {
        id: m.id,
        _id: m._id,
        title: m.title,
        slug: m.slug,
        coverImageUrl: m.coverImageUrl,
        tags: m.tags,
        views: m.views,
        likesCount: m.likesCount,
      };
    });

    res.json(posts);
  } catch (err) {
    console.error("getTopPosts:", err);
    res
      .status(500)
      .json({ message: "Failed to get top posts", err: err.message || err });
  }
};

// Get posts by tag name
const getPostsByTag = async (req, res) => {
  try {
    const tagName = req.params.tag;
    if (!tagName) return res.json([]);

    const tag = await prisma.tag.findUnique({
      where: { name: tagName },
      select: { id: true },
    });
    if (!tag) return res.json([]);

    // Find postTag entries for this tag, include post (and post relations)
    const postTags = await prisma.postTag.findMany({
      where: { tagId: tag.id },
      include: {
        post: {
          where: { isDraft: false },
          include: {
            author: { select: { id: true, name: true, profileImageUrl: true } },
            postTags: { include: { tag: true } },
          },
        },
      },
    });

    // Extract posts (filter nulls) and map
    const posts = postTags
      .map((pt) => pt.post)
      .filter(Boolean)
      // Remove duplicates (same post may appear multiple times)
      .reduce((acc, curr) => {
        if (!acc.some((p) => p.id === curr.id)) acc.push(curr);
        return acc;
      }, [])
      .map(mapPostForClient);

    res.json(posts);
  } catch (err) {
    console.error("getPostsByTag:", err);
    res
      .status(500)
      .json({ message: "Failed to get posts by tag", err: err.message || err });
  }
};

// Search posts
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

    const posts = postsRaw.map(mapPostForClient);
    res.json(posts);
  } catch (err) {
    console.error("searchPosts:", err);
    res.status(500).json({ message: "Server Error", err: err.message || err });
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
