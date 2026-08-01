const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");

const router = express.Router();

function getOwnedAccount(userId, accountId) {
  return db.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`).get(accountId, userId);
}

// FR-03 Account Management
router.get("/", requireAuth, (req, res) => {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE user_id = ?`).all(req.user.sub);
  res.json({ accounts: accounts.map(fmtAccount) });
});

router.get("/:id/statement", requireAuth, (req, res) => {
  const account = getOwnedAccount(req.user.sub, req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });
  const txs = db
    .prepare(`SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`)
    .all(account.id);
  res.json({ account: fmtAccount(account), transactions: txs.map(fmtTx) });
});

router.post("/:id/freeze", requireAuth, (req, res) => {
  const account = getOwnedAccount(req.user.sub, req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });
  db.prepare(`UPDATE accounts SET card_frozen = 1 WHERE id = ?`).run(account.id);
  logAction(req.user.sub, "card_frozen", { accountId: account.id }, req.ip);
  res.json({ message: "Card frozen" });
});

router.post("/:id/unfreeze", requireAuth, (req, res) => {
  const account = getOwnedAccount(req.user.sub, req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });
  db.prepare(`UPDATE accounts SET card_frozen = 0 WHERE id = ?`).run(account.id);
  logAction(req.user.sub, "card_unfrozen", { accountId: account.id }, req.ip);
  res.json({ message: "Card unfrozen" });
});

function fmtAccount(a) {
  return {
    id: a.id,
    accountNumber: a.account_number,
    accountType: a.account_type,
    balance: a.balance_cents / 100,
    currency: a.currency,
    cardFrozen: !!a.card_frozen,
  };
}
function fmtTx(t) {
  return {
    id: t.id,
    type: t.type,
    counterparty: t.counterparty,
    amount: t.amount_cents / 100,
    channel: t.channel,
    status: t.status,
    fraudScore: t.fraud_score,
    fraudReason: t.fraud_reason,
    createdAt: t.created_at,
  };
}

module.exports = { router, getOwnedAccount, fmtAccount, fmtTx };
