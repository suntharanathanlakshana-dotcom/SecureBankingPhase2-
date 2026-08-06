// routes/scheduledTransfers.js
// FR-04 extension: lets a customer set up a future-dated or recurring transfer instead of
// sending it immediately. Execution happens out-of-band (utils/scheduledTransfers.js),
// run periodically by server.js and opportunistically here so the list always reflects
// anything that has come due since the page was last loaded.

const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount } = require("./accounts");
const { runDueScheduledTransfers } = require("../utils/scheduledTransfers");

const router = express.Router();
const FREQUENCIES = ["once", "weekly", "monthly"];

function fmt(s) {
  return {
    id: s.id,
    toAccountNumber: s.to_account_number,
    amount: s.amount_cents / 100,
    channel: s.channel,
    frequency: s.frequency,
    nextRunAt: s.next_run_at,
    endDate: s.end_date,
    status: s.status,
    lastRunAt: s.last_run_at,
    lastRunStatus: s.last_run_status,
    createdAt: s.created_at,
  };
}

router.post("/", requireAuth, (req, res) => {
  const { fromAccountId, toAccountNumber, amount, channel, frequency, startDate, endDate } = req.body || {};
  const account = getOwnedAccount(req.user.sub, fromAccountId);
  if (!account) return res.status(404).json({ error: "Source account not found" });
  if (!toAccountNumber) return res.status(400).json({ error: "Recipient account is required" });

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid amount" });

  const freq = FREQUENCIES.includes(frequency) ? frequency : "once";

  let nextRunAt;
  if (startDate) {
    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "Invalid start date" });
    nextRunAt = parsed.toISOString().slice(0, 19).replace("T", " ");
  } else {
    nextRunAt = db.prepare(`SELECT datetime('now') AS n`).get().n;
  }

  if (endDate && freq === "once") {
    return res.status(400).json({ error: "An end date only applies to weekly or monthly schedules" });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO scheduled_transfers (id, user_id, account_id, to_account_number, amount_cents, channel, frequency, next_run_at, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.user.sub, account.id, toAccountNumber, amountCents, channel || "CEFTS", freq, nextRunAt, endDate || null);

  logAction(req.user.sub, "scheduled_transfer_created", { id, amountCents, frequency: freq }, req.ip);
  const row = db.prepare(`SELECT * FROM scheduled_transfers WHERE id = ?`).get(id);
  res.status(201).json({ message: "Scheduled transfer created", scheduledTransfer: fmt(row) });
});

router.get("/", requireAuth, (req, res) => {
  runDueScheduledTransfers(); // opportunistically catch up anything due since the last tick
  const rows = db
    .prepare(`SELECT * FROM scheduled_transfers WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.user.sub);
  res.json({ scheduledTransfers: rows.map(fmt) });
});

router.post("/:id/cancel", requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM scheduled_transfers WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.sub);
  if (!row) return res.status(404).json({ error: "Scheduled transfer not found" });
  db.prepare(`UPDATE scheduled_transfers SET status = 'cancelled' WHERE id = ?`).run(row.id);
  logAction(req.user.sub, "scheduled_transfer_cancelled", { id: row.id }, req.ip);
  res.json({ message: "Scheduled transfer cancelled" });
});

router.post("/:id/pause", requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM scheduled_transfers WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.sub);
  if (!row) return res.status(404).json({ error: "Scheduled transfer not found" });
  if (row.status !== "active") return res.status(400).json({ error: "Only an active schedule can be paused" });
  db.prepare(`UPDATE scheduled_transfers SET status = 'paused' WHERE id = ?`).run(row.id);
  res.json({ message: "Scheduled transfer paused" });
});

router.post("/:id/resume", requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM scheduled_transfers WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.sub);
  if (!row) return res.status(404).json({ error: "Scheduled transfer not found" });
  if (row.status !== "paused") return res.status(400).json({ error: "Only a paused schedule can be resumed" });
  db.prepare(`UPDATE scheduled_transfers SET status = 'active' WHERE id = ?`).run(row.id);
  res.json({ message: "Scheduled transfer resumed" });
});

module.exports = router;
