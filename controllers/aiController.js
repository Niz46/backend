// backend/controllers/aiController.js
const { GoogleGenAI } = require("@google/genai");
const {
  blogPostIdeasPrompt,
  generateReplyPrompt,
  blogSummaryPrompt,
} = require("../utils/prompts");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Try to extract useful provider error details from a thrown error.
 * Returns { statusCode, message, providerRaw, retryAfterSeconds }
 */
function parseGenAIError(err) {
  const out = {
    statusCode: null,
    message: null,
    providerRaw: null,
    retryAfterSeconds: null,
  };

  try {
    // Prefer structured fields first (library might expose response/error)
    if (err?.response?.data) {
      out.providerRaw = err.response.data;
      const data = err.response.data;

      // Google-style top-level wrapper might be stringified; try common shapes:
      const errorObj = data.error || data; // sometimes the API returns { error: { ... } }
      if (errorObj) {
        out.message = errorObj.message || JSON.stringify(errorObj);
        // status code
        if (errorObj.code) out.statusCode = Number(errorObj.code);
        if (errorObj.status && !out.statusCode) {
          // "RESOURCE_EXHAUSTED" etc.
          out.statusCode =
            errorObj.status === "RESOURCE_EXHAUSTED" ? 429 : out.statusCode;
        }
        // look into details for RetryInfo
        if (Array.isArray(errorObj.details)) {
          for (const d of errorObj.details) {
            if (
              d["@type"] &&
              d["@type"].includes("RetryInfo") &&
              d.retryDelay
            ) {
              // retryDelay might be "46s"
              const s = String(d.retryDelay || "");
              const m = s.match(/(\d+)(s|m)?/);
              if (m) {
                const value = Number(m[1]) || 0;
                out.retryAfterSeconds = m[2] === "m" ? value * 60 : value;
              }
              break;
            }
          }
        }
      }
    } else if (typeof err === "string") {
      out.providerRaw = err;
      out.message = err;
      // try to find JSON inside string
      const idx = err.indexOf("{");
      if (idx !== -1) {
        const jsonPart = err.slice(idx);
        try {
          const parsed = JSON.parse(jsonPart);
          if (parsed?.error) {
            out.message = parsed.error.message || out.message;
            if (parsed.error.code) out.statusCode = Number(parsed.error.code);
            if (parsed.error.details) {
              for (const d of parsed.error.details) {
                if (
                  d["@type"] &&
                  d["@type"].includes("RetryInfo") &&
                  d.retryDelay
                ) {
                  const s = String(d.retryDelay);
                  const m = s.match(/(\d+)(s|m)?/);
                  if (m) {
                    out.retryAfterSeconds =
                      m[2] === "m" ? Number(m[1]) * 60 : Number(m[1]);
                  }
                }
              }
            }
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    } else if (err?.message) {
      out.providerRaw = err;
      out.message = err.message;
    } else {
      out.providerRaw = err;
      out.message = String(err);
    }
  } catch (e) {
    // parsing failed — return best-effort
    out.providerRaw = err;
    out.message = err?.message || String(err);
  }

  // fallbacks
  if (!out.statusCode && out.message && out.message.includes("Quota"))
    out.statusCode = 429;
  if (!out.message && out.providerRaw)
    out.message = String(out.providerRaw).slice(0, 500);

  return out;
}

/**
 * If it's a quota / rate-limit error, respond 429 with Retry-After header.
 * Otherwise respond 500.
 */
function respondWithProviderError(res, parsed) {
  if (
    parsed.statusCode === 429 ||
    (parsed.message &&
      /quota|Resource_exhausted|RESOURCE_EXHAUSTED/i.test(parsed.message))
  ) {
    if (parsed.retryAfterSeconds) {
      res.set("Retry-After", String(parsed.retryAfterSeconds));
    }
    return res.status(429).json({
      message: "AI provider quota/rate limit reached. Try again later.",
      detail: parsed.message,
      retryAfterSeconds: parsed.retryAfterSeconds || null,
      provider: parsed.providerRaw
        ? typeof parsed.providerRaw === "string"
          ? parsed.providerRaw
          : parsed.providerRaw
        : undefined,
    });
  }

  // generic server error
  return res.status(500).json({
    message: "AI provider error",
    detail: parsed.message,
    provider: parsed.providerRaw,
  });
}

/**
 * Lightweight transient retry helper for network errors (not quota).
 * Retries up to 'attempts' with exponential backoff.
 */
async function transientRetry(fn, attempts = 1, initialDelayMs = 500) {
  let attempt = 0;
  let lastErr;
  while (attempt <= attempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // if it's likely quota-related, stop retrying
      const parsed = parseGenAIError(err);
      if (
        parsed.statusCode === 429 ||
        /quota|RESOURCE_EXHAUSTED/i.test(parsed.message || "")
      ) {
        throw err; // bubble up so caller can handle with 429
      }
      // otherwise backoff & retry
      const delay = initialDelayMs * Math.pow(1, attempt);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

/* -----------------------------
   Controller methods (exports)
   ----------------------------- */

const generateBlogPost = async (req, res) => {
  try {
    const { title, tone } = req.body;
    if (!title || !tone)
      return res.status(400).json({ message: "Missing required fields" });

    const prompt = `Write a markdown-formatted blog post titled "${title}". Use a ${tone} tone. Include introduction, subheadings, examples if relevant, and a conclusion.`;

    // Attempt a small transient retry for network flakiness
    const response = await transientRetry(() =>
      ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt }),
    );

    // library shape: response.text or response?.output or similar — preserve your original usage
    const rawText =
      response?.text ??
      response?.output ??
      (typeof response === "string" ? response : null);

    return res.status(200).json({ content: rawText });
  } catch (err) {
    console.error("generateBlogPost error:", err);
    const parsed = parseGenAIError(err);
    return respondWithProviderError(res, parsed);
  }
};

const generateBlogPostIdeas = async (req, res) => {
  try {
    const { topics } = req.body;
    if (!topics)
      return res.status(400).json({ message: "Missing required fields" });

    const prompt = blogPostIdeasPrompt(topics);

    const response = await transientRetry(() =>
      ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt }),
    );

    const rawText =
      response?.text ??
      response?.output ??
      (typeof response === "string" ? response : null);
    if (!rawText) {
      return res.status(502).json({ message: "Empty AI response" });
    }

    const cleanedText = rawText
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();
    // parse safely
    let data;
    try {
      data = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("Failed to parse AI JSON output:", {
        cleanedText,
        parseErr,
      });
      return res.status(502).json({
        message: "AI returned invalid JSON. Try again or change model/prompt.",
        aiRaw: cleanedText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("generateBlogPostIdeas error:", err);
    const parsed = parseGenAIError(err);
    return respondWithProviderError(res, parsed);
  }
};

const generateCommentReply = async (req, res) => {
  try {
    const { author, content } = req.body;
    if (!content)
      return res.status(400).json({ message: "Missing required fields" });

    const prompt = generateReplyPrompt({ author, content });

    const response = await transientRetry(() =>
      ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt }),
    );

    const rawText =
      response?.text ??
      response?.output ??
      (typeof response === "string" ? response : null);
    return res.status(200).json({ reply: rawText });
  } catch (err) {
    console.error("generateCommentReply error:", err);
    const parsed = parseGenAIError(err);
    return respondWithProviderError(res, parsed);
  }
};

const generatePostSummary = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content)
      return res.status(400).json({ message: "Missing required fields" });

    const prompt = blogSummaryPrompt(content);

    const response = await transientRetry(() =>
      ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt }),
    );

    const rawText =
      response?.text ??
      response?.output ??
      (typeof response === "string" ? response : null);
    if (!rawText) return res.status(502).json({ message: "Empty AI response" });

    const cleanedText = rawText
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();

    let data;
    try {
      data = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("Failed to parse AI JSON output (summary):", {
        cleanedText,
        parseErr,
      });
      return res.status(502).json({
        message:
          "AI returned invalid JSON for summary. Try again or change model/prompt.",
        aiRaw: cleanedText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("generatePostSummary error:", err);
    const parsed = parseGenAIError(err);
    return respondWithProviderError(res, parsed);
  }
};

module.exports = {
  generateBlogPost,
  generateBlogPostIdeas,
  generateCommentReply,
  generatePostSummary,
};
