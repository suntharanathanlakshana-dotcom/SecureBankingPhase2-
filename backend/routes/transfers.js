const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateOtp, verifyOtp } = require("../utils/otp");
const { scoreTransaction } = require("../utils/fraud");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount, fmtAccount } = require("./accounts");
const { TRANSACTION_FEE_CENTS, checkDebit, insufficientBalanceMessage } = require("../utils/limits");

const router = express.Router();

// Step 1: initiate — validates funds, runs fraud pre-check, issues OTP (matches Phase-1
// "Continue -> Verify with OTP" wireframe)
router.post("/initiate", requireAuth, (req, res) => {
  const { fromAccountId, toAccountNumber, amount, channel } = req.body || {};
  const account = getOwnedAccount(req.user.sub, fromAccountId);
  if (!account) return res.status(404).json({ error: "Source account not found" });
  if (account.card_frozen) return res.status(403).json({ error: "This account is frozen" });

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid amount" });
  if (!checkDebit(account, amountCents).ok) return res.status(400).json({ error: insufficientBalanceMessage() });
  if (!toAccountNumber) return res.status(400).json({ error: "Recipient account is required" });

  const preCheck = scoreTransaction({ accountId: account.id, amountCents, type: "transfer_out" });
  const { code } = generateOtp(req.user.sub, "transfer");

  res.json({
    message: "Verification required to complete this transfer",
    fraudPreCheck: { score: preCheck.score, note: preCheck.reason },
    demoOtp: code, // DEMO ONLY — a real system sends this via SMS/push, not the API response
  });
});

// Step 2: confirm with OTP -> commits the transfer
router.post("/confirm", requireAuth, (req, res) => {
  const { fromAccountId, toAccountNumber, amount, channel, code } = req.body || {};
  const account = getOwnedAccount(req.user.sub, fromAccountId);
  if (!account) return res.status(404).json({ error: "Source account not found" });

  const otp = verifyOtp(req.user.sub, "transfer", code);
  if (!otp.ok) return res.status(401).json({ error: otp.reason });

  const amountCents = Math.round(Number(amount) * 100);
  const debit = checkDebit(account, amountCents);
  if (!debit.ok) return res.status(400).json({ error: insufficientBalanceMessage() });

  const fraud = scoreTransaction({ accountId: account.id, amountCents, type: "transfer_out" });

  const txId = uuid();
  if (fraud.blocked) {
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score, fraud_reason)
       VALUES (?, ?, 'transfer_out', ?, ?, ?, 'blocked', ?, ?)`
    ).run(txId, account.id, toAccountNumber, amountCents, channel || "CEFTS", fraud.score, fraud.reason);

    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'critical')`
    ).run(uuid(), req.user.sub, "Transfer blocked", `A transfer of Rs. ${(amountCents / 100).toFixed(2)} was blocked by fraud screening (${fraud.reason}).`);

    logAction(req.user.sub, "transfer_blocked", { txId, amountCents, reason: fraud.reason }, req.ip);
    return res.status(403).json({ error: "This transfer was blocked by fraud screening", reason: fraud.reason });
  }

  const feeTxId = uuid();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(debit.totalCents, account.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score)
       VALUES (?, ?, 'transfer_out', ?, ?, ?, 'completed', ?)`
    ).run(txId, account.id, toAccountNumber, amountCents, channel || "CEFTS", fraud.score);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'transaction_fee', 'SecureBank service fee', ?, ?, 'completed')`
    ).run(feeTxId, account.id, TRANSACTION_FEE_CENTS, channel || "CEFTS");
  });
  tx();

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'info')`
  ).run(uuid(), req.user.sub, "Transfer sent", `Rs. ${(amountCents / 100).toFixed(2)} sent to ${toAccountNumber} via ${channel || "CEFTS"} (plus Rs. ${(TRANSACTION_FEE_CENTS / 100).toFixed(2)} transaction fee).`);

  logAction(req.user.sub, "transfer_completed", { txId, amountCents, feeCents: TRANSACTION_FEE_CENTS }, req.ip);

  const updated = getOwnedAccount(req.user.sub, fromAccountId);
  res.json({ message: "Transfer completed", account: fmtAccount(updated), transactionId: txId, feeCharged: TRANSACTION_FEE_CENTS / 100 });
});

module.exports = router;
