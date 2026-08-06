const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/overview", (req, res) => {
  const users = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'customer'`).get().c;
  const accounts = db.prepare(`SELECT COUNT(*) c FROM accounts`).get().c;
  const totalBalance = db.prepare(`SELECT COALESCE(SUM(balance_cents),0) s FROM accounts`).get().s / 100;
  const txToday = db
    .prepare(`SELECT COUNT(*) c FROM transactions WHERE date(created_at) = date('now')`)
    .get().c;
  const blockedTx = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE status = 'blocked'`).get().c;
  const openDisputes = db.prepare(`SELECT COUNT(*) c FROM disputes WHERE status = 'open'`).get().c;
  res.json({ users, accounts, totalBalance, txToday, blockedTx, openDisputes });
});

router.get("/users", (req, res) => {
  const users = db
    .prepare(`SELECT id, full_name, username, email, role, status, created_at FROM users ORDER BY created_at DESC`)
    .all();
  res.json({ users });
});

router.post("/users/:id/freeze", (req, res) => {
  db.prepare(`UPDATE users SET status = 'frozen' WHERE id = ?`).run(req.params.id);
  logAction(req.user.sub, "admin_freeze_user", { targetUser: req.params.id }, req.ip);
  res.json({ message: "User account frozen" });
});

router.post("/users/:id/unfreeze", (req, res) => {
  db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(req.params.id);
  logAction(req.user.sub, "admin_unfreeze_user", { targetUser: req.params.id }, req.ip);
  res.json({ message: "User account reactivated" });
});

router.get("/transactions", (req, res) => {
  const txs = db
    .prepare(
      `SELECT t.*, a.account_number, u.full_name FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN users u ON u.id = a.user_id
       ORDER BY t.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ transactions: txs });
});

router.get("/fraud-alerts", (req, res) => {
  const flagged = db
    .prepare(
      `SELECT t.*, a.account_number, u.full_name FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN users u ON u.id = a.user_id
       WHERE t.fraud_score >= 30 ORDER BY t.created_at DESC LIMIT 100`
    )
    .all();
  res.json({ flagged });
});

router.get("/disputes", (req, res) => {
  const disputes = db
    .prepare(
      `SELECT d.*, u.full_name, u.username FROM disputes d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC`
    )
    .all();
  res.json({ disputes });
});

router.post("/disputes/:id/status", (req, res) => {
  const { status } = req.body || {};
  if (!["open", "investigating", "resolved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare(`UPDATE disputes SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  logAction(req.user.sub, "dispute_status_updated", { disputeId: req.params.id, status }, req.ip);
  res.json({ message: "Dispute updated" });
});

router.get("/audit-log", (req, res) => {
  const logs = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 300`).all();
  res.json({ logs });
});

module.exports = router;
