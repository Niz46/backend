// backend/middleware/auth.js or wherever protect is defined
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const protect = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (token && token.startsWith("Bearer")) {
      token = token.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profileImageUrl: true,
        },
      });

      if (!user)
        return res
          .status(401)
          .json({ message: "Not authorized: user not found" });

      req.user = user;
      return next();
    } else {
      return res.status(401).json({ message: "Not authorized, no token" });
    }
  } catch (err) {
    console.error("protect:", err);
    return res.status(401).json({ message: "Token failed", err: err.message });
  }
};
module.exports = { protect };
