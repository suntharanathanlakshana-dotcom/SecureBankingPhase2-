// routes/reports.js
// FR-12 Regulatory Reporting — generates CBSL-style reports referenced in the Phase 1
// document: transaction summaries and IT/cybersecurity incident reports (per Circular
// No. 2 of 2025). Admin-only.

const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/transaction-summary", (req, res) => {
  const rows = db
    .prepare(
      `SELECT type, channel, status, COUNT(*) as count, SUM(amount_cents) as total_cents
       FROM transactions GROUP BY type, channel, status ORDER BY type`
    )
    .all();
  res.json({
    reportType: "Transaction Summary",
    generatedAt: new Date().toISOString(),
    rows: rows.map((r) => ({ ...r, total: r.total_cents / 100 })),
  });
});

router.get("/incidents", (req, res) => {
  const incidents = db.prepare(`SELECT * FROM incident_reports ORDER BY created_at DESC`).all();
  res.json({ incidents });
});

router.post("/incidents", (req, res) => {
  const { category, severity, description } = req.body || {};
  if (!category || !severity || !description) {
    return res.status(400).json({ error: "category, severity, and description are required" });
  }
  const id = uuid();
  db.prepare(
    `INSERT INTO incident_reports (id, category, severity, description) VALUES (?, ?, ?, ?)`
  ).run(id, category, severity, description);
  res.status(201).json({ incident: db.prepare(`SELECT * FROM incident_reports WHERE id = ?`).get(id) });
});

// Simple CSV export of the audit trail, standing in for a CBSL-submittable compliance export
router.get("/audit-export.csv", (req, res) => {
  const logs = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 1000`).all();
  const header = "id,user_id,action,detail,ip,created_at\n";
  const body = logs
    .map((l) =>
      [l.id, l.user_id, l.action, JSON.stringify(l.detail || "").replace(/,/g, ";"), l.ip, l.created_at].join(",")
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=securebank-audit-export.csv");
  res.send(header + body);
});

module.exports = router;
