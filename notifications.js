const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const notes = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .all(req.user.sub);
  res.json({
    notifications: notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      severity: n.severity,
      read: !!n.read,
      createdAt: n.created_at,
    })),
  });
});

router.post("/:id/read", requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.sub);
  res.json({ message: "Marked as read" });
});

module.exports = router;
