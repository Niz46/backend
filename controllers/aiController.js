const { GoogleGenAI } = require("@google/genai");
const {
  blogPostIdeasPrompt,
  generateReplyPrompt,
  blogSummaryPrompt,
} = require("../utils/prompts");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// @desc    Generate blog content from title
// @route   POST /api/generate
// @access  Private
const generateBlogPost = async (req, res) => {
  try {
    const { title, tone } = req.body;

    if (!title || !tone) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const prompt = `Write a markdown-formatted blog post titled "${title}". Use a ${tone} tone. Incude an introduction, subheadings, reference examples if relevant, and a conclusion.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    let rawText = response.text;
    res.status(200).json(rawText);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to generate blog post", err: err.message });
  }
};

// @desc    Generate blog post ideas from title
// @route   POST /api/generate-ideas
// @access  Private
const generateBlogPostIdeas = async (req, res) => {
  try {
    const { topics } = req.body;

    if (!topics) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const prompt = blogPostIdeasPrompt(topics);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    let rawText = response.text;

    const cleanedText = rawText
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();

    const data = JSON.parse(cleanedText);

    res.status(200).json(data);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to generate blog ideas", err: err.message });
  }
};

// @desc    Generate comment reply
// @route   POST /api/generate-reply
// @access  Private
const generateCommentReply = async (req, res) => {
  try {
    const { author, content } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const prompt = generateReplyPrompt({ author, content });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    let rawText = response.text;
    res.status(200).json(rawText);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to generate comment reply", err: err.message });
  }
};

// @desc    Generate blog post summary
// @route   POST /api/generate-summary
// @access  Public
const generatePostSummary = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const prompt = blogSummaryPrompt(content);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    let rawText = response.text;

    const cleanedText = rawText
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();

    const data = JSON.parse(cleanedText);
    res.status(200).json(data);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to generate post summary", err: err.message });
  }
};

module.exports = {
  generateBlogPost,
  generateBlogPostIdeas,
  generateCommentReply,
  generatePostSummary,
};
