const cloudinary = require("cloudinary").v2;

exports.getGalleryByTag = async (req, res) => {
  try {
    const { tag } = req.query;
    
    if (!tag) {
      return res.status(400).json({ message: "Tag is required" });
    }

    // Use Cloudinary Admin API to fetch resources by tag
    const result = await cloudinary.api.resources_by_tag(tag, {
      max_results: 100, // Adjust as needed
      direction: "desc", // Newest first
    });

    // Format the response for your frontend GalleryCard
    const formattedImages = result.resources.map((img) => ({
      src: img.secure_url,
      title: img.public_id.split('/').pop(), // Extract filename as fallback title
      author: tag,
      created_at: img.created_at,
    }));

    res.status(200).json(formattedImages);
  } catch (error) {
    console.error("Cloudinary fetch error:", error);
    res.status(500).json({ message: "Failed to fetch gallery images" });
  }
};