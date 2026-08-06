const { v4: uuid } = require("uuid");
const db = require("../db");

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes, matches Phase 1 cardless-withdrawal spec

function generateOtp(userId, purpose) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = uuid();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO otp_codes (id, user_id, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, code, purpose, expiresAt);
  // In production this is dispatched via SMS/push (Azure Notification Hubs / Service Bus).
  // For this demo it is returned directly in the API response so it can be entered in the UI.
  return { id, code, expiresAt };
}

function verifyOtp(userId, purpose, code) {
  const row = db
    .prepare(
      `SELECT * FROM otp_codes WHERE user_id = ? AND purpose = ? AND code = ? AND consumed = 0
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, purpose, code);
  if (!row) return { ok: false, reason: "Invalid or already-used code" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "Code expired" };
  db.prepare(`UPDATE otp_codes SET consumed = 1 WHERE id = ?`).run(row.id);
  return { ok: true };
}

module.exports = { generateOtp, verifyOtp };
