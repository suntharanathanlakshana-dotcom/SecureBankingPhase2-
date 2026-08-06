// routes/webauthn.js
// Implements FR-02a (Biometric Login) using the real WebAuthn standard, so "Fingerprint" and
// "Face ID" in this demo are the browser's actual platform authenticator (Windows Hello /
// Touch ID / Android BiometricPrompt) — not a simulated button. Biometric data never leaves
// the user's device or reaches this server; only a signed public-key assertion does.

const express = require("express");
const { v4: uuid } = require("uuid");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requireAuth, signToken, JWT_SECRET } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const router = express.Router();

const RP_NAME = "SecureBank";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:5173";

const challengeStore = new Map(); // userId or 'anon' -> challenge (demo only; use Redis/Session in production)

// A pre-MFA token only proves the password step passed (see routes/auth.js). Enrollment
// during login accepts that token instead of a full session so a customer who has never
// registered a biometric can be walked through FR-02a setup before login can complete —
// this is what makes Face ID / Fingerprint a *mandatory* second factor rather than optional.
function readPreAuth(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.stage === "pre_mfa" ? payload : null;
  } catch {
    return null;
  }
}

// ---- Registration (customer opts in to biometric login from the settings/security page) ----
router.post("/register/options", requireAuth, async (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.sub);
  const existing = db.prepare(`SELECT credential_id FROM webauthn_credentials WHERE user_id = ?`).all(user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id),
    userName: user.username,
    userDisplayName: user.full_name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, type: "public-key" })),
    authenticatorSelection: {
      authenticatorAttachment: "platform", // forces fingerprint/Face ID/Windows Hello, not a security key
      userVerification: "required",
      residentKey: "preferred",
    },
  });

  challengeStore.set(user.id, options.challenge);
  res.json(options);
});

router.post("/register/verify", requireAuth, async (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.sub);
  const expectedChallenge = challengeStore.get(user.id);
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    if (!verification.verified) return res.status(400).json({ error: "Could not verify biometric registration" });

    const { credential } = verification.registrationInfo;
    db.prepare(
      `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_type, label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      user.id,
      credential.id,
      Buffer.from(credential.publicKey).toString("base64"),
      credential.counter,
      req.body.response?.authenticatorAttachment || "platform",
      "Fingerprint / Face ID"
    );

    logAction(user.id, "biometric_registered", null, req.ip);
    res.json({ message: "Biometric login enabled for this device" });
  } catch (e) {
    res.status(400).json({ error: "Registration failed: " + e.message });
  }
});

// ---- Enrollment during login (used when a customer has no biometric credential yet —
// completes enrollment AND finishes login in the same step) ----
router.post("/login-enroll/options", async (req, res) => {
  const payload = readPreAuth(req.body?.preAuthToken);
  if (!payload) return res.status(401).json({ error: "MFA session expired, please log in again" });
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = db.prepare(`SELECT credential_id FROM webauthn_credentials WHERE user_id = ?`).all(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id),
    userName: user.username,
    userDisplayName: user.full_name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, type: "public-key" })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  });

  challengeStore.set(user.id, options.challenge);
  res.json(options);
});

router.post("/login-enroll/verify", async (req, res) => {
  const { preAuthToken, response } = req.body || {};
  const payload = readPreAuth(preAuthToken);
  if (!payload) return res.status(401).json({ error: "MFA session expired, please log in again" });
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  const expectedChallenge = challengeStore.get(user.id);
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    if (!verification.verified) return res.status(400).json({ error: "Could not verify biometric registration" });

    const { credential } = verification.registrationInfo;
    db.prepare(
      `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_type, label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      user.id,
      credential.id,
      Buffer.from(credential.publicKey).toString("base64"),
      credential.counter,
      response?.authenticatorAttachment || "platform",
      "Fingerprint / Face ID"
    );

    const token = signToken(user);
    logAction(user.id, "biometric_registered_at_login", null, req.ip);
    logAction(user.id, "login_success", { factor: "webauthn_biometric_enrollment" }, req.ip);
    res.json({ token, user: { id: user.id, fullName: user.full_name, username: user.username, role: user.role } });
  } catch (e) {
    res.status(400).json({ error: "Registration failed: " + e.message });
  }
});

// ---- Authentication (used as the second factor at login, or to approve a sensitive action) ----
router.post("/login/options", async (req, res) => {
  const { username } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user) return res.status(404).json({ error: "User not found" });

  const creds = db.prepare(`SELECT credential_id FROM webauthn_credentials WHERE user_id = ?`).all(user.id);
  if (creds.length === 0) return res.status(400).json({ error: "No biometric credential registered for this user" });

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({ id: c.credential_id, type: "public-key" })),
  });

  challengeStore.set(`login:${user.id}`, options.challenge);
  res.json({ options, userId: user.id });
});

router.post("/login/verify", async (req, res) => {
  const { userId, response } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const cred = db.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`).get(response.id);
  if (!cred) return res.status(400).json({ error: "Unknown credential" });

  const expectedChallenge = challengeStore.get(`login:${user.id}`);
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, "base64"),
        counter: cred.counter,
      },
    });
    if (!verification.verified) return res.status(401).json({ error: "Biometric verification failed" });

    db.prepare(`UPDATE webauthn_credentials SET counter = ? WHERE id = ?`).run(
      verification.authenticationInfo.newCounter,
      cred.id
    );

    const token = signToken(user);
    logAction(user.id, "login_success", { factor: "webauthn_biometric" }, req.ip);
    res.json({ token, user: { id: user.id, fullName: user.full_name, username: user.username, role: user.role } });
  } catch (e) {
    res.status(400).json({ error: "Verification failed: " + e.message });
  }
});

router.get("/status", requireAuth, (req, res) => {
  const creds = db
    .prepare(`SELECT id, label, device_type, created_at FROM webauthn_credentials WHERE user_id = ?`)
    .all(req.user.sub);
  res.json({ registered: creds.length > 0, credentials: creds });
});

module.exports = router;
