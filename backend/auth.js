const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "yasrab-secret-2024-key";
const EXPIRES_IN = "24h";

const createToken = (user) => {
  try {
    return jwt.sign(
      { username: user.username, role: user.role, id: user.id },
      SECRET,
      { expiresIn: EXPIRES_IN }
    );
  } catch (err) {
    console.error("❌ Token creation failed:", err.message);
    throw err;
  }
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
      code: "NO_AUTH_TOKEN"
    });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({
      success: false,
      message,
      code: "INVALID_TOKEN"
    });
  }
};

module.exports = { createToken, verifyToken };
