const BlogPost = require("../models/BlogPost");
const Comment = require("../models/Comment");

// @desc    Dashboard summary
// @route   GET /api/dashboard-summary
// @access  Private (Admin only)
const getDashboardSummary = async (req, res) => {
  try {
    // 1️⃣ Get your counts
    const [totalPosts, drafts, published, totalComments, aiGenerated] =
      await Promise.all([
        BlogPost.countDocuments(),
        BlogPost.countDocuments({ isDraft: true }),
        BlogPost.countDocuments({ isDraft: false }),
        Comment.countDocuments(),
        BlogPost.countDocuments({ generatedByAI: true }),
      ]);

    // 2️⃣ Aggregate views & likes
    const [{ total: totalViews = 0 } = {}] =
      await BlogPost.aggregate([
        { $group: { _id: null, total: { $sum: "$views" } } },
      ]);
    const [{ total: totalLikes = 0 } = {}] =
      await BlogPost.aggregate([
        { $group: { _id: null, total: { $sum: "$likes" } } },
      ]);

    // 3️⃣ Fetch your top‑posts array
    const topPosts = await BlogPost.find({ isDraft: false })
      // fix the projection: no commas in the field list!
      .select("title coverImageUrl views likes")
      .sort({ views: -1, likes: -1 })
      .limit(5);

    // 4️⃣ Recent comments & tag usage (unchanged)
    const recentComments = await Comment.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("author", "name profileImageUrl")
      .populate("post", "title coverImageUrl coverVideoUrl");

    const tagUsage = await BlogPost.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $project: { tag: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);

    // 5️⃣ Return them in the shape your front‑end expects
    return res.json({
      stats: {
        totalPosts,
        drafts,
        published,
        totalViews,
        totalLikes,
        totalComments,
        aiGenerated,
      },
      topPosts,          // array of 5 docs
      recentComments,
      tagUsage,
    });
  } catch (err) {
    console.error("Error fetching dashboard summary:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch dashboard summary", err: err.message });
  }
};


module.exports = { getDashboardSummary };
