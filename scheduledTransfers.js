// utils/scheduledTransfers.js
// Executes due scheduled/recurring transfers (FR-04 extension). Mirrors the same
// fraud-screening + minimum-balance + transaction-fee rules as an interactive transfer
// (routes/transfers.js), so a recurring payment can never bypass the checks a manual
// transfer would go through. No OTP step here — the customer already authorized the
// schedule up front; that authorization is the equivalent of the OTP step for future runs.

const { v4: uuid } = require("uuid");
const db = require("../db");
const { scoreTransaction } = require("./fraud");
const { logAction } = require("../middleware/audit");
const { TRANSACTION_FEE_CENTS, checkDebit } = require("./limits");

function nextRunAfter(current, frequency) {
  const d = new Date(current);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Finds every scheduled transfer that is due and executes it. Safe to call repeatedly
 * (e.g. from a periodic timer and opportunistically from the list endpoint) — a schedule
 * only runs once its next_run_at has actually elapsed, and is immediately advanced or
 * closed out so it can't double-fire.
 */
function runDueScheduledTransfers() {
  const due = db
    .prepare(`SELECT * FROM scheduled_transfers WHERE status = 'active' AND next_run_at <= datetime('now')`)
    .all();

  for (const sched of due) {
    executeOne(sched);
  }
}

function executeOne(sched) {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(sched.account_id);
  const nowIso = new Date().toISOString().slice(0, 19).replace("T", " ");

  function closeOut(status, note) {
    db.prepare(
      `UPDATE scheduled_transfers SET status = ?, last_run_at = ?, last_run_status = ? WHERE id = ?`
    ).run(status, nowIso, note, sched.id);
  }

  function reschedule(note) {
    const stillActive = !sched.end_date || new Date(sched.end_date) > new Date();
    if (sched.frequency === "once" || !stillActive) {
      closeOut("completed", note);
      return;
    }
    db.prepare(
      `UPDATE scheduled_transfers SET next_run_at = ?, last_run_at = ?, last_run_status = ? WHERE id = ?`
    ).run(nextRunAfter(sched.next_run_at, sched.frequency), nowIso, note, sched.id);
  }

  if (!account || account.card_frozen) {
    reschedule("failed: account unavailable or frozen");
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'warning')`
    ).run(uuid(), sched.user_id, "Scheduled transfer skipped", `A scheduled transfer of Rs. ${(sched.amount_cents / 100).toFixed(2)} to ${sched.to_account_number} could not run because the account is unavailable or frozen.`);
    return;
  }

  const debit = checkDebit(account, sched.amount_cents);
  if (!debit.ok) {
    reschedule("failed: insufficient balance");
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'warning')`
    ).run(uuid(), sched.user_id, "Scheduled transfer failed", `A scheduled transfer of Rs. ${(sched.amount_cents / 100).toFixed(2)} to ${sched.to_account_number} failed due to insufficient balance.`);
    logAction(sched.user_id, "scheduled_transfer_failed", { scheduleId: sched.id, reason: "insufficient_balance" }, null);
    return;
  }

  const fraud = scoreTransaction({ accountId: account.id, amountCents: sched.amount_cents, type: "transfer_out" });
  if (fraud.blocked) {
    reschedule("failed: blocked by fraud screening");
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'critical')`
    ).run(uuid(), sched.user_id, "Scheduled transfer blocked", `A scheduled transfer of Rs. ${(sched.amount_cents / 100).toFixed(2)} to ${sched.to_account_number} was blocked by fraud screening (${fraud.reason}).`);
    logAction(sched.user_id, "scheduled_transfer_blocked", { scheduleId: sched.id, reason: fraud.reason }, null);
    return;
  }

  const txId = uuid();
  const feeTxId = uuid();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(debit.totalCents, account.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score)
       VALUES (?, ?, 'transfer_out', ?, ?, ?, 'completed', ?)`
    ).run(txId, account.id, sched.to_account_number, sched.amount_cents, sched.channel, fraud.score);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'transaction_fee', 'SecureBank service fee', ?, ?, 'completed')`
    ).run(feeTxId, account.id, TRANSACTION_FEE_CENTS, sched.channel);
  });
  tx();

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'info')`
  ).run(uuid(), sched.user_id, "Scheduled transfer sent", `Rs. ${(sched.amount_cents / 100).toFixed(2)} sent to ${sched.to_account_number} via a scheduled transfer (plus Rs. ${(TRANSACTION_FEE_CENTS / 100).toFixed(2)} fee).`);

  logAction(sched.user_id, "scheduled_transfer_completed", { scheduleId: sched.id, txId, amountCents: sched.amount_cents }, null);
  reschedule("completed");
}

module.exports = { runDueScheduledTransfers, nextRunAfter };
