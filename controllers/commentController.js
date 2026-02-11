// backend/controllers/commentController.js
const prisma = require("../config/prisma");

// @desc    Add a comment to a blog post
// @route   POST /api/comments/:postId
// @access  Private
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentComment } = req.body;
    const authorId = req.user.id;

    // Basic validation
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    // Resolve post by id OR slug (robust to frontend using either)
    const post = await prisma.blogPost.findFirst({
      where: {
        OR: [{ id: postId }, { slug: postId }],
      },
      select: { id: true },
    });

    if (!post) return res.status(404).json({ message: "Post not found" });

    // Build create payload using relation inputs (Prisma expects nested 'parent' relation)
    const createData = {
      content: content.trim(),
      post: { connect: { id: post.id } },
      author: { connect: { id: authorId } },
    };

    // If there's a parentComment id provided, connect using the relation 'parent'
    if (parentComment) {
      createData.parent = { connect: { id: parentComment } };
    }

    const comment = await prisma.comment.create({
      data: createData,
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
      },
    });

    res.status(201).json(comment);
  } catch (err) {
    console.error("addComment:", err);
    res
      .status(500)
      .json({ message: "Failed to add comment", err: err.message });
  }
};

// @desc    Get all comments
// @route   GET /api/comments
// @access  Public
const getAllComments = async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        post: {
          select: { id: true, title: true, coverImageUrl: true, slug: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Convert to nested structure
    const map = {};
    const list = comments.map((c) => ({ ...c, replies: [] }));
    list.forEach((c) => (map[c.id] = c));
    const root = [];
    list.forEach((c) => {
      if (c.parentId) {
        const p = map[c.parentId];
        if (p) p.replies.push(c);
      } else {
        root.push(c);
      }
    });

    res.json(root);
  } catch (err) {
    console.error("getAllComments:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch comments", err: err.message });
  }
};

// @desc    Get all comments for a blog post
// @route   GET /api/comments/:postId
// @access  Public
const getCommentsByPost = async (req, res) => {
  try {
    const postParam = req.params.postId;

    // Resolve post by id || slug
    const post = await prisma.blogPost.findFirst({
      where: { OR: [{ id: postParam }, { slug: postParam }] },
      select: { id: true },
    });

    if (!post) return res.status(404).json({ message: "Post not found" });

    // Now query comments by the resolved post.id
    const comments = await prisma.comment.findMany({
      where: { postId: post.id },
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const map = {};
    const list = comments.map((c) => ({ ...c, replies: [] }));
    list.forEach((c) => (map[c.id] = c));
    const root = [];
    list.forEach((c) => {
      if (c.parentId) {
        const p = map[c.parentId];
        if (p) p.replies.push(c);
      } else {
        root.push(c);
      }
    });

    res.json(root);
  } catch (err) {
    console.error("getCommentsByPost:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch comments by post", err: err.message });
  }
};

// @desc    Delete a comment and its replies (author and admin only)
// @route   DELETE /api/comments/:commentId
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const commentId = req.params.commentId;
    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { parentId: commentId } }),
      prisma.comment.delete({ where: { id: commentId } }),
    ]);
    res.json({ message: "Comment and replies deleted" });
  } catch (err) {
    console.error("deleteComment:", err);
    res
      .status(500)
      .json({ message: "Failed to delete comment", err: err.message });
  }
};

module.exports = {
  addComment,
  getAllComments,
  getCommentsByPost,
  deleteComment,
};
