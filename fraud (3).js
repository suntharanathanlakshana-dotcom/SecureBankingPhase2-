// routes/fraud.js
// FR-07 extension: exposes the "AI-powered" plain-language explanation behind a
// transaction's fraud score (see utils/fraud.js#explainFraud). Customers can view
// explanations only for their own transactions; admins (back-office) can view any.

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { explainFraud } = require("../utils/fraud");

const router = express.Router();

router.get("/explain/:transactionId", requireAuth, (req, res) => {
  const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.transactionId);
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  if (req.user.role !== "admin") {
    const owns = db
      .prepare(`SELECT 1 FROM accounts WHERE id = ? AND user_id = ?`)
      .get(tx.account_id, req.user.sub);
    if (!owns) return res.status(403).json({ error: "Not authorized to view this transaction" });
  }

  const explanation = explainFraud({
    score: tx.fraud_score,
    reason: tx.fraud_reason,
    blocked: tx.status === "blocked",
    amountCents: tx.amount_cents,
    type: tx.type,
  });

  res.json({ transactionId: tx.id, score: tx.fraud_score, status: tx.status, explanation });
});

module.exports = router;
