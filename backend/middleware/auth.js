const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";

// A JWT only proves who the customer was *at login time*. Account state (frozen by an
// admin, deleted, etc.) can change during the life of a 12h token, so every authenticated
// request re-checks current status against the database rather than trusting the token
// payload alone. This closes the gap where an admin freeze wouldn't take effect until the
// customer's existing session expired.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing authentication token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.stage === "pre_mfa") {
      // Pre-MFA tokens only ever prove the password step passed; they must never be
      // accepted as a full session by protected routes.
      return res.status(401).json({ error: "MFA verification required" });
    }

    const user = db.prepare(`SELECT id, role, status FROM users WHERE id = ?`).get(payload.sub);
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    if (user.status === "frozen") {
      return res.status(403).json({ error: "This account has been frozen. Contact support." });
    }

    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Insufficient privileges" });
    }
    next();
  };
}

function signToken(user, extra = {}) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, ...extra },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

module.exports = { requireAuth, requireRole, signToken, JWT_SECRET };
