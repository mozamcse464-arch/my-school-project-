const jwt = require("jsonwebtoken");

let SECRET = process.env.JWT_SECRET;
let REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const EXPIRES_IN = "24h";
const REFRESH_EXPIRES_IN = "7d";

const tokenBlacklist = new Set();

if (!SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is not set in environment (required in production)');
    process.exit(1);
  } else {
    console.warn('Warning: JWT_SECRET not set — using development fallback (not secure)');
    SECRET = "yasrab-dev-fallback-secret";
  }
}

if (!REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_REFRESH_SECRET is not set in environment (required in production)');
    process.exit(1);
  } else {
    console.warn('Warning: JWT_REFRESH_SECRET not set — using development fallback');
    REFRESH_SECRET = "yasrab-dev-fallback-refresh-secret";
  }
}

const createToken = (user) => {
  try {
    const token = jwt.sign(
      { username: user.username, role: user.role, id: user.id, type: 'access' },
      SECRET,
      { expiresIn: EXPIRES_IN, issuer: 'yasrab-school', audience: 'admin-panel' }
    );
    return token;
  } catch (err) {
    console.error("❌ Access token creation failed:", err.message);
    throw err;
  }
};

const createRefreshToken = (user) => {
  try {
    const token = jwt.sign(
      { username: user.username, role: user.role, id: user.id, type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: REFRESH_EXPIRES_IN, issuer: 'yasrab-school' }
    );
    return token;
  } catch (err) {
    console.error("❌ Refresh token creation failed:", err.message);
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
      code: "NO_AUTH_TOKEN",
      requiresLogin: true
    });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({
      success: false,
      message: "Token has been revoked",
      code: "TOKEN_REVOKED",
      requiresLogin: true
    });
  }

  try {
    const decoded = jwt.verify(token, SECRET, {
      issuer: 'yasrab-school',
      audience: 'admin-panel'
    });

    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
        code: "INVALID_TOKEN_TYPE"
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    let message = "Invalid token";
    let code = "INVALID_TOKEN";

    if (err.name === "TokenExpiredError") {
      message = "Token expired";
      code = "TOKEN_EXPIRED";
    } else if (err.name === "JsonWebTokenError") {
      message = "Malformed token";
      code = "MALFORMED_TOKEN";
    }

    return res.status(401).json({
      success: false,
      message,
      code,
      requiresLogin: code === "TOKEN_EXPIRED" || code === "TOKEN_REVOKED"
    });
  }
};

const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET, {
      issuer: 'yasrab-school'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    return decoded;
  } catch (err) {
    console.error('Refresh token verification error:', err.message);
    throw new Error('Invalid or expired refresh token');
  }
};

const revokeToken = (token) => {
  tokenBlacklist.add(token);
  // Auto-cleanup for expired tokens (every hour)
  setTimeout(() => tokenBlacklist.delete(token), 3600000);
};

module.exports = {
  createToken,
  createRefreshToken,
  verifyToken,
  verifyRefreshToken,
  revokeToken
};
