const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { scoreTransaction } = require("../utils/fraud");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount, fmtAccount } = require("./accounts");
const { TRANSACTION_FEE_CENTS, checkDebit, insufficientBalanceMessage } = require("../utils/limits");

const router = express.Router();

const CODE_TTL_MS = 5 * 60 * 1000;
const ATMS = [
  { id: "ATM-NUG-01", name: "Bank of Ceylon — Nugegoda", distanceKm: 0.4 },
  { id: "ATM-COL-07", name: "SecureBank — Colombo Fort", distanceKm: 2.1 },
  { id: "ATM-KAN-03", name: "SecureBank — Kandy City Centre", distanceKm: 6.8 },
];

router.get("/atms", requireAuth, (req, res) => res.json({ atms: ATMS }));

// Step 1 (mobile app): generate a single-use withdrawal code after biometric/PIN confirmation.
// `confirmedWith` should be 'biometric' or 'pin' — the client performs the actual WebAuthn
// or PIN check before calling this endpoint.
router.post("/request", requireAuth, (req, res) => {
  const { accountId, amount, atmId, confirmedWith } = req.body || {};
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!confirmedWith) return res.status(400).json({ error: "Identity confirmation (biometric or PIN) is required" });

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid amount" });
  if (!checkDebit(account, amountCents).ok) return res.status(400).json({ error: insufficientBalanceMessage() });

  const atm = ATMS.find((a) => a.id === atmId) || ATMS[0];

  const fraud = scoreTransaction({ accountId: account.id, amountCents, type: "atm_withdrawal" });
  if (fraud.blocked) {
    logAction(req.user.sub, "cardless_request_blocked", { amountCents, reason: fraud.reason }, req.ip);
    return res.status(403).json({ error: "Withdrawal blocked by fraud screening", reason: fraud.reason });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = uuid();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO cardless_codes (id, account_id, code, amount_cents, atm_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, account.id, code, amountCents, atm.id, expiresAt);

  logAction(req.user.sub, "cardless_code_issued", { atmId: atm.id, amountCents, confirmedWith }, req.ip);
  res.json({ code, atm, expiresAt, fraudScore: fraud.score });
});

// Step 2 (ATM terminal simulation): redeem the code, dispense cash
router.post("/redeem", (req, res) => {
  // NOTE: unauthenticated by design — the physical ATM is the authenticated device in a real
  // deployment (via HSM-backed terminal keys), and the OTP code is itself the customer factor.
  const { atmId, code } = req.body || {};
  const record = db.prepare(`SELECT * FROM cardless_codes WHERE code = ? AND atm_id = ?`).get(code, atmId);
  if (!record) return res.status(404).json({ error: "Invalid code for this ATM" });
  if (record.status !== "pending") return res.status(410).json({ error: "This code has already been used or voided" });
  if (new Date(record.expires_at).getTime() < Date.now()) {
    db.prepare(`UPDATE cardless_codes SET status = 'expired' WHERE id = ?`).run(record.id);
    return res.status(410).json({ error: "This code has expired" });
  }

  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(record.account_id);
  const debit = checkDebit(account, record.amount_cents);
  if (!debit.ok) {
    return res.status(400).json({ error: insufficientBalanceMessage() });
  }

  const txId = uuid();
  const feeTxId = uuid();
  const commit = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(debit.totalCents, account.id);
    db.prepare(`UPDATE cardless_codes SET status = 'dispensed' WHERE id = ?`).run(record.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'atm_withdrawal', ?, ?, 'ATM', 'completed')`
    ).run(txId, account.id, atmId, record.amount_cents);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'transaction_fee', 'SecureBank service fee', ?, 'ATM', 'completed')`
    ).run(feeTxId, account.id, TRANSACTION_FEE_CENTS);
  });
  commit();

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'info')`
  ).run(
    uuid(),
    account.user_id,
    "Cardless withdrawal completed",
    `Rs. ${(record.amount_cents / 100).toFixed(2)} withdrawn at ${atmId} without a card (plus Rs. ${(TRANSACTION_FEE_CENTS / 100).toFixed(2)} transaction fee).`
  );

  logAction(account.user_id, "cardless_withdrawal_dispensed", { atmId, amountCents: record.amount_cents, feeCents: TRANSACTION_FEE_CENTS, txId }, req.ip);
  const updated = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(account.id);
  res.json({ message: "Cash dispensed", amount: record.amount_cents / 100, feeCharged: TRANSACTION_FEE_CENTS / 100, newBalance: updated.balance_cents / 100 });
});

router.get("/status", requireAuth, (req, res) => {
  const { accountId } = req.query;
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });
  const codes = db
    .prepare(`SELECT * FROM cardless_codes WHERE account_id = ? ORDER BY created_at DESC LIMIT 5`)
    .all(account.id);
  res.json({ codes });
});

module.exports = router;
