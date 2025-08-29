// backend/controllers/blogPostController.js
const prisma = require("../config/prisma");
const slugify = require("slugify");
const agenda = require("../config/agenda");

// @desc    Create a new blog post
// @route   POST /api/posts
// @access  Private (Admin only)
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
    const authorId = req.user.id;

    if (!title || !content)
      return res.status(400).json({ message: "Missing fields" });

    const slug = slugify(title, { lower: true, strict: true });

    // create tags if they don't exist and connect
    const tagConnectOrCreate = tags.map((t) => ({
      where: { name: t },
      create: { name: t },
    }));

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
        tags: { connectOrCreate: tagConnectOrCreate },
      },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        tags: true,
      },
    });

    const subscribers = await prisma.user.findMany({
      where: { role: "member" },
      select: { email: true },
    });
    await agenda.now("broadcast-new-post", {
      emails: subscribers.map((s) => s.email),
      postTitle: post.title,
      postUrl: `${process.env.FRONTEND_URL}/posts/${post.slug}`,
    });

    res.status(201).json(post);
  } catch (err) {
    console.error("createPost:", err);
    res
      .status(500)
      .json({ message: "Failed to create post", err: err.message });
  }
};

// @desc    Update an existing post
// @route   PUT /api/posts/:id
// @access  Private (Author or Admin)
const updatePost = async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;

    if (payload.title) {
      payload.slug = slugify(payload.title, { lower: true, strict: true });
    }

    // If tags are provided, map and connectOrCreate similar to create
    if (payload.tags) {
      const tagConnectOrCreate = payload.tags.map((t) => ({
        where: { name: t },
        create: { name: t },
      }));
      // remove tags from payload, handle separately
      delete payload.tags;

      const updated = await prisma.blogPost.update({
        where: { id },
        data: {
          ...payload,
          tags: { connectOrCreate: tagConnectOrCreate },
        },
      });

      return res.json(updated);
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data: payload,
    });
    res.json(updated);
  } catch (err) {
    console.error("updatePost:", err);
    res
      .status(500)
      .json({ message: "Failed to update post", err: err.message });
  }
};

// @desc    Delete a blog post
// @route   DELETE /api/posts/:id
// @access  Private (Author or Admin)
const deletePost = async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.blogPost.delete({ where: { id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("deletePost:", err);
    res
      .status(500)
      .json({ message: "Failed to delete post", err: err.message });
  }
};

// @desc    Get blog posts by status (all, published, or draft) and include counts
// @route   GET /api/posts?status=published|draft|all&page=1
// @access  Public
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

    const [posts, totalCount, allCount, publishedCount, draftCount] =
      await Promise.all([
        prisma.blogPost.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
          include: {
            author: { select: { id: true, name: true, profileImageUrl: true } },
            tags: true,
          },
        }),
        prisma.blogPost.count({ where }),
        prisma.blogPost.count(),
        prisma.blogPost.count({ where: { isDraft: false } }),
        prisma.blogPost.count({ where: { isDraft: true } }),
      ]);

    res.json({
      posts,
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      counts: { all: allCount, published: publishedCount, draft: draftCount },
    });
  } catch (err) {
    console.error("getAllPosts:", err);
    res.status(500).json({ message: "Server Error", err: err.message });
  }
};

// @desc    Get a single blog post by slug
// @route   GET /api/posts/:slug
// @access  Public
const getPostBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const post = await prisma.blogPost.findUnique({
      where: { slug },
      include: { author: true, tags: true },
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

    res.json({ ...post, hasLiked });
  } catch (err) {
    console.error("getPostBySlug:", err);
    res.status(500).json({ message: "Failed to get post", err: err.message });
  }
};

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
      .json({ message: "Failed to increment view count", err: err.message });
  }
};

// @desc    Like a post
// @route   PUT /api/posts/:id/like
// @access  Public
const likePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = req.params.id;

    // create PostLike if not exists (transaction)
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
    res.json({ message: "Like added", likes: updated.likesCount });
  } catch (err) {
    console.error("likePost:", err);
    res
      .status(500)
      .json({ message: "Failed to like post", error: err.message });
  }
};

// @desc    Get top trending post
// @route   GET /api/posts/trending
// @access  Private
const getTopPosts = async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { isDraft: false },
      orderBy: [{ views: "desc" }, { likesCount: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        coverImageUrl: true,
        views: true,
        likesCount: true,
        slug: true,
      },
    });
    res.json(posts);
  } catch (err) {
    console.error("getTopPosts:", err);
    res
      .status(500)
      .json({ message: "Failed to get top posts", err: err.message });
  }
};

module.exports = {
  createPost,
  updatePost,
  deletePost,
  getAllPosts,
  getPostBySlug,
  getPostsByTag: async (req, res) => {
    try {
      const tagName = req.params.tag;
      const tag = await prisma.tag.findUnique({
        where: { name: tagName },
        include: { posts: true },
      });
      if (!tag) return res.json([]);
      const posts = await prisma.blogPost.findMany({
        where: { tags: { some: { id: tag.id } }, isDraft: false },
        include: { author: true, tags: true },
      });
      res.json(posts);
    } catch (err) {
      console.error("getPostsByTag:", err);
      res
        .status(500)
        .json({ message: "Failed to get posts by tag", err: err.message });
    }
  },
  searchPosts: async (req, res) => {
    try {
      const q = req.query.q || "";
      const posts = await prisma.blogPost.findMany({
        where: {
          isDraft: false,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        include: { author: true },
      });
      res.json(posts);
    } catch (err) {
      console.error("searchPosts:", err);
      res.status(500).json({ message: "Server Error", err: err.message });
    }
  },
  incrementView,
  likePost,
  getTopPosts,
};
