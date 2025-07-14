const { parse } = require("dotenv");
const BlogPost = require("../models/BlogPost");
const mongoose = require("mongoose");
const { post } = require("../routes/authRoutes");

// @desc    Create a new blog post
// @route   POST /api/posts
// @access  Private (Admin only)
const createPost = async (req, res) => {
  try {
    const {
      title,
      content,
      coverImageUrl,
      coverVideoUrl,
      tags,
      isDraft,
      generatedByAI,
    } = req.body;

    const slug = title
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^\w-]+/g, "");
    const newPost = new BlogPost({
      title,
      slug,
      content,
      coverImageUrl,
      coverVideoUrl,
      tags,
      author: req.user._id,
      isDraft,
      generatedByAI,
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create a post", err: err.message });
  }
};

// @desc    Update an existing post
// @route   PUT /api/posts/:id
// @access  Private (Author or Admin)
const updatePost = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (
      post.author.toString() !== req.user._id.toString() &&
      !req.user.isAdmin
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this post" });
    }

    const updatedData = req.body;
    if (updatedData.title) {
      updatedData.slug = updatedData.title
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^\w-]+/g, "");
    }

    const updatePost = await BlogPost.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );
    res.json(updatePost);
  } catch (err) {
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
    const postId = req.params.id;
    const post   = await BlogPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await post.deleteOne();
    return res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("Error in deletePost:", err);
    return res
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
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status === "published") filter.isDraft = false;
    else if (status === "draft") filter.isDraft = true;

    const posts = await BlogPost.find(filter)
      .populate("author", "name profileImageUrl")
      .sort({ updateAt: -1 })
      .skip(skip)
      .limit(limit);

    const [totalCount, allCount, publishedCount, draftCount] =
      await Promise.all([
        BlogPost.countDocuments(filter),
        BlogPost.countDocuments(),
        BlogPost.countDocuments({ isDraft: false }),
        BlogPost.countDocuments({ isDraft: true }),
      ]);

    res.json({
      posts,
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      counts: {
        all: allCount,
        published: publishedCount,
        draft: draftCount,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", err: err.message });
  }
};

// @desc    Get a single blog post by slug
// @route   GET /api/posts/:slug
// @access  Public
const getPostBySlug = async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug }).populate(
      "author",
      "name profileImageUrl"
    );
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get post by slug", err: err.message });
  }
};

// @desc    Get posts by tag
// @route   GET /api/posts/tag/:tag
// @access  Public
const getPostsByTag = async (req, res) => {
  try {
    const posts = await BlogPost.find({
      tags: req.params.tag,
      isDraft: false,
    }).populate("author", "name profileImageUrl");
    res.json(posts);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get post by tag", err: err.message });
  }
};

// @desc    Search posts by title or content
// @route   GET /api/posts/search?q=keyword
// @access  Public
const searchPosts = async (req, res) => {
  try {
    const q = req.query.q;
    const posts = await BlogPost.find({
      isDraft: false,
      sort: [
        { title: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
      ],
    }).populate("author", "name profileImageUrl");
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Server Error", err: err.message });
  }
};

// @desc    Increment post view count
// @route   PUT /api/posts/:id/view
// @access  Public
const incrementView = async (req, res) => {
  try {
    await BlogPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ message: "View count incremented" });
  } catch (err) {
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
    await BlogPost.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    res.json({ message: "Like added" });
  } catch (err) {
    res.status(500).json({ message: "Failed to like post", err: err.message });
  }
};

// @desc    Get top trending post
// @route   GET /api/posts/trending
// @access  Private
const getTopPosts = async (req, res) => {
  try {
    const posts = await BlogPost.find({ isDraft: false })
      .sort({ views: -1, likes: -1 })
      .limit(5);

    res.json(posts);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get top post", err: err.message });
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
