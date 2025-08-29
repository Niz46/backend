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

    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = await prisma.comment.create({
      data: {
        content,
        post: { connect: { id: postId } },
        author: { connect: { id: authorId } },
        parentId: parentComment || null,
      },
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
        post: { select: { id: true, title: true, coverImageUrl: true } },
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
    const postId = req.params.postId;
    const comments = await prisma.comment.findMany({
      where: { postId },
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
