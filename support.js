const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const disputes = db
    .prepare(`SELECT * FROM disputes WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.user.sub);
  res.json({ disputes });
});

router.post("/", requireAuth, (req, res) => {
  const { transactionId, subject, description } = req.body || {};
  if (!subject || !description) return res.status(400).json({ error: "Subject and description are required" });

  const id = uuid();
  db.prepare(
    `INSERT INTO disputes (id, user_id, transaction_id, subject, description) VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.user.sub, transactionId || null, subject, description);

  logAction(req.user.sub, "dispute_created", { id, subject }, req.ip);
  res.status(201).json({ dispute: db.prepare(`SELECT * FROM disputes WHERE id = ?`).get(id) });
});

module.exports = router;
