// backend/controllers/authController.js
const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const agenda = require("../config/agenda");

const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

// @desc    Resigter a new user
// @route   POST /api/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, profileImageUrl, bio, adminAccessToken } =
      req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Missing required fields" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    let role = "member";
    if (adminAccessToken && adminAccessToken === process.env.ADMIN_ACCESS_TOKEN)
      role = "admin";

    const user = await prisma.user.create({
      data: { name, email, password: hashed, profileImageUrl, bio, role },
      select: {
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        bio: true,
        role: true,
      },
    });

    await agenda.now("send-welcome-email", { to: user.email, name: user.name });
    await agenda.schedule("in 5 days", "send-nudge-email", {
      to: user.email,
      name: user.name,
    });
    await agenda.every("30 days", "send-monthly-reminder", {
      to: user.email,
      name: user.name,
    });

    res.status(201).json({ ...user, token: generateToken(user.id) });
  } catch (err) {
    console.error("registerUser:", err);
    res.status(500).json({ message: "Server error", err: err.message });
  }
};

// @desc    Login user
// route    POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing credentials" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid email or password" });

    await agenda.now("send-login-email", {
      to: user.email,
      name: user.name,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      token: generateToken(user.id),
    });
  } catch (err) {
    console.error("loginUser:", err);
    res.status(500).json({ message: "Server error", err: err.message });
  }
};

// @desc    Get User profile
// route    Get /api/auth/profile
// @access  Private (Requires JWT)
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: false,
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("getUserProfile:", err);
    res.status(500).json({ message: "Server error", err: err.message });
  }
};

module.exports = { registerUser, loginUser, getUserProfile };
