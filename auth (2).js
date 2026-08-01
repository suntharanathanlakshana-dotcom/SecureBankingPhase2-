const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { generateOtp, verifyOtp } = require("../utils/otp");
const { logAction } = require("../middleware/audit");

const router = express.Router();

// FR-01 Account Onboarding & Migration (simplified: fresh registration for the demo,
// representing a customer re-establishing access after their backed-up record is re-linked)
router.post("/register", (req, res) => {
  const { fullName, username, email, phone, nic, password } = req.body || {};
  if (!fullName || !username || !email || !phone || !nic || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const dupe = db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).get(username, email);
  if (dupe) return res.status(409).json({ error: "Username or email already registered" });

  const userId = uuid();
  db.prepare(
    `INSERT INTO users (id, full_name, username, email, phone, nic, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, fullName, username, email, phone, nic, bcrypt.hashSync(password, 10));

  const accountId = uuid();
  const accountNumber = `SB-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(
    `INSERT INTO accounts (id, user_id, account_number, account_type, balance_cents)
     VALUES (?, ?, ?, 'savings', 0)`
  ).run(accountId, userId, accountNumber);

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'info')`
  ).run(uuid(), userId, "Account created", `Your SecureBank account ${accountNumber} is ready.`);

  logAction(userId, "register", { username }, req.ip);
  res.status(201).json({ message: "Account created", accountNumber });
});

// Step 1 of login: verify password, then require a second factor (OTP or WebAuthn biometric)
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    // Tie the audit entry to the account when the username is real (so the owner can see
    // failed attempts against their own login history) without changing the response the
    // caller sees — we still never reveal whether the username itself exists.
    logAction(user ? user.id : null, "login_failed", { username }, req.ip);
    return res.status(401).json({ error: "Invalid username or password" });
  }
  if (user.status === "frozen") {
    return res.status(403).json({ error: "This account has been frozen. Contact support." });
  }

  const hasBiometric = !!db.prepare(`SELECT id FROM webauthn_credentials WHERE user_id = ?`).get(user.id);
  const { code } = generateOtp(user.id, "login_mfa");

  // Short-lived pre-auth token: proves password step passed, but is NOT a full session token.
  const preAuthToken = signToken(user, { stage: "pre_mfa" });

  logAction(user.id, "login_password_ok", null, req.ip);
  res.json({
    message: "Password verified. Complete MFA to finish logging in.",
    preAuthToken,
    hasBiometric,
    // DEMO ONLY: a real deployment sends this via SMS/push, never in the API response.
    demoOtp: code,
  });
});

// Step 2 of login: OTP-based MFA
router.post("/login/verify-otp", (req, res) => {
  const { preAuthToken, code } = req.body || {};
  let payload;
  try {
    payload = require("jsonwebtoken").verify(preAuthToken, require("../middleware/auth").JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "MFA session expired, please log in again" });
  }
  if (payload.stage !== "pre_mfa") return res.status(400).json({ error: "Invalid MFA session" });

  const result = verifyOtp(payload.sub, "login_mfa", code);
  if (!result.ok) return res.status(401).json({ error: result.reason });

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
  const token = signToken(user);
  logAction(user.id, "login_success", { factor: "otp" }, req.ip);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

// FR-02 extension: login history — lets a customer audit successful and failed sign-in
// attempts against their own account, across every factor (password+OTP or biometric).
router.get("/login-history", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, action, detail, ip, created_at FROM audit_log
       WHERE user_id = ? AND action IN ('login_success', 'login_failed')
       ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.sub);

  const history = rows.map((r) => {
    let detail = {};
    try { detail = r.detail ? JSON.parse(r.detail) : {}; } catch { /* ignore malformed legacy rows */ }
    return {
      id: r.id,
      result: r.action === "login_success" ? "success" : "failed",
      factor: detail.factor || (r.action === "login_failed" ? "password" : null),
      ip: r.ip,
      createdAt: r.created_at,
    };
  });

  res.json({ history });
});

// Lets a customer switch their preferred display language (FR: multi-language support).
router.post("/language", requireAuth, (req, res) => {
  const { language } = req.body || {};
  if (!["en", "si", "ta"].includes(language)) {
    return res.status(400).json({ error: "Unsupported language. Use en, si, or ta." });
  }
  db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(language, req.user.sub);
  logAction(req.user.sub, "language_changed", { language }, req.ip);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.sub);
  res.json({ user: publicUser(user) });
});

function publicUser(u) {
  return {
    id: u.id,
    fullName: u.full_name,
    username: u.username,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    language: u.language,
  };
}

module.exports = router;
