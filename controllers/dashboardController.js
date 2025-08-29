// backend/controllers/dashboardController.js
const prisma = require("../config/prisma");

// @desc    Dashboard summary
const getDashboardSummary = async (req, res) => {
  try {
    const [totalPosts, drafts, published, totalComments, aiGenerated, sumAgg] =
      await Promise.all([
        prisma.blogPost.count(),
        prisma.blogPost.count({ where: { isDraft: true } }),
        prisma.blogPost.count({ where: { isDraft: false } }),
        prisma.comment.count(),
        prisma.blogPost.count({ where: { generatedByAI: true } }),
        prisma.blogPost.aggregate({ _sum: { views: true, likesCount: true } }),
      ]);

    const totalViews = (sumAgg._sum && sumAgg._sum.views) || 0;
    const totalLikes = (sumAgg._sum && sumAgg._sum.likesCount) || 0;

    const topPosts = await prisma.blogPost.findMany({
      where: { isDraft: false },
      select: {
        id: true,
        title: true,
        coverImageUrl: true,
        views: true,
        likesCount: true,
        slug: true,
      },
      orderBy: [{ views: "desc" }, { likesCount: "desc" }],
      take: 5,
    });

    const recentComments = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        author: { select: { id: true, name: true, profileImageUrl: true } },
        post: { select: { id: true, title: true, coverImageUrl: true } },
      },
    });

    // Count usage via postTags relation
    const tagUsageRaw = await prisma.tag.findMany({
      take: 10,
      include: {
        _count: { select: { postTags: true } },
      },
      orderBy: {
        postTags: {
          _count: "desc",
        },
      },
    });

    const tagUsage = tagUsageRaw.map((t) => ({
      tag: t.name,
      count: t._count?.postTags ?? 0,
    }));

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
      topPosts,
      recentComments,
      tagUsage,
    });
  } catch (err) {
    console.error("getDashboardSummary:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch dashboard summary", err: err.message });
  }
};

module.exports = { getDashboardSummary };
