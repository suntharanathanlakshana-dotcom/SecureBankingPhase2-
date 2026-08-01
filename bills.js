const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { scoreTransaction } = require("../utils/fraud");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount, fmtAccount } = require("./accounts");
const { TRANSACTION_FEE_CENTS, checkDebit, insufficientBalanceMessage } = require("../utils/limits");

const router = express.Router();

const BILLERS = [
  { code: "CEB", name: "Ceylon Electricity Board" },
  { code: "NWSDB", name: "National Water Supply & Drainage Board" },
  { code: "SLT", name: "Sri Lanka Telecom" },
  { code: "DIALOG", name: "Dialog Axiata" },
];

router.get("/billers", requireAuth, (req, res) => res.json({ billers: BILLERS }));

// FR-05: bill payment
router.post("/pay", requireAuth, (req, res) => {
  const { accountId, billerCode, referenceNo, amount } = req.body || {};
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const biller = BILLERS.find((b) => b.code === billerCode);
  if (!biller) return res.status(400).json({ error: "Unknown biller" });

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid amount" });
  const debit = checkDebit(account, amountCents);
  if (!debit.ok) return res.status(400).json({ error: insufficientBalanceMessage() });

  const fraud = scoreTransaction({ accountId: account.id, amountCents, type: "bill_payment" });
  const txId = uuid();
  const feeTxId = uuid();

  const commit = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(debit.totalCents, account.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score)
       VALUES (?, ?, 'bill_payment', ?, ?, 'SLIPS', 'completed', ?)`
    ).run(txId, account.id, `${biller.name} (Ref: ${referenceNo || "N/A"})`, amountCents, fraud.score);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'transaction_fee', 'SecureBank service fee', ?, 'SLIPS', 'completed')`
    ).run(feeTxId, account.id, TRANSACTION_FEE_CENTS);
  });
  commit();

  logAction(req.user.sub, "bill_payment", { txId, biller: biller.code, amountCents, feeCents: TRANSACTION_FEE_CENTS }, req.ip);
  res.json({ message: "Bill paid", account: fmtAccount(getOwnedAccount(req.user.sub, accountId)), feeCharged: TRANSACTION_FEE_CENTS / 100 });
});

// FR-05: LankaQR-style merchant payment (simulated QR code scan)
router.post("/qr-pay", requireAuth, (req, res) => {
  const { accountId, merchantQr, amount } = req.body || {};
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid amount" });
  const debit = checkDebit(account, amountCents);
  if (!debit.ok) return res.status(400).json({ error: insufficientBalanceMessage() });

  const merchantName = merchantQr || "Unknown Merchant";
  const fraud = scoreTransaction({ accountId: account.id, amountCents, type: "qr_payment" });
  const txId = uuid();
  const feeTxId = uuid();

  const commit = db.transaction(() => {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(debit.totalCents, account.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score)
       VALUES (?, ?, 'qr_payment', ?, ?, 'LankaQR', 'completed', ?)`
    ).run(txId, account.id, merchantName, amountCents, fraud.score);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'transaction_fee', 'SecureBank service fee', ?, 'LankaQR', 'completed')`
    ).run(feeTxId, account.id, TRANSACTION_FEE_CENTS);
  });
  commit();

  logAction(req.user.sub, "qr_payment", { txId, merchantName, amountCents, feeCents: TRANSACTION_FEE_CENTS }, req.ip);
  res.json({ message: "Payment sent", account: fmtAccount(getOwnedAccount(req.user.sub, accountId)), feeCharged: TRANSACTION_FEE_CENTS / 100 });
});

module.exports = router;
