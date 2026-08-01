// routes/analytics.js
// Spending analytics dashboard (Phase 2 stand-out feature). Aggregates the customer's own
// transaction history — no new tables needed, this reads the same `transactions` rows the
// Statement page already shows, just grouped differently.

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const SPEND_TYPES = ["transfer_out", "bill_payment", "qr_payment", "atm_withdrawal", "loan_repayment", "transaction_fee"];
const INCOME_TYPES = ["transfer_in", "loan_disbursement"];

const CATEGORY_LABELS = {
  transfer_out: "Transfers",
  bill_payment: "Bills",
  qr_payment: "QR Payments",
  atm_withdrawal: "ATM Withdrawals",
  loan_repayment: "Loan Repayments",
  transaction_fee: "Fees",
};

router.get("/spending", requireAuth, (req, res) => {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE user_id = ?`).all(req.user.sub);
  if (accounts.length === 0) return res.json({ months: [], categories: [], totals: { spent: 0, income: 0 } });

  const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
  const accountIds = accounts.map((a) => a.id);
  const placeholders = accountIds.map(() => "?").join(",");

  const rows = db
    .prepare(
      `SELECT type, amount_cents, created_at FROM transactions
       WHERE account_id IN (${placeholders}) AND status = 'completed'
       AND created_at >= datetime('now', '-${months} months')
       ORDER BY created_at ASC`
    )
    .all(...accountIds);

  const monthBuckets = new Map(); // "YYYY-MM" -> { spent, income }
  const categoryTotals = new Map(); // type -> cents

  for (const r of rows) {
    const monthKey = r.created_at.slice(0, 7);
    if (!monthBuckets.has(monthKey)) monthBuckets.set(monthKey, { spent: 0, income: 0 });
    const bucket = monthBuckets.get(monthKey);

    if (SPEND_TYPES.includes(r.type)) {
      bucket.spent += r.amount_cents;
      categoryTotals.set(r.type, (categoryTotals.get(r.type) || 0) + r.amount_cents);
    } else if (INCOME_TYPES.includes(r.type)) {
      bucket.income += r.amount_cents;
    }
  }

  const sortedMonths = [...monthBuckets.keys()].sort();
  const monthSeries = sortedMonths.map((key) => ({
    month: key,
    spent: monthBuckets.get(key).spent / 100,
    income: monthBuckets.get(key).income / 100,
  }));

  const totalSpentCents = [...categoryTotals.values()].reduce((s, v) => s + v, 0);
  const categories = [...categoryTotals.entries()]
    .map(([type, cents]) => ({
      type,
      label: CATEGORY_LABELS[type] || type,
      amount: cents / 100,
      percent: totalSpentCents > 0 ? Math.round((cents / totalSpentCents) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalIncomeCents = monthSeries.reduce((s, m) => s + m.income * 100, 0);

  res.json({
    months: monthSeries,
    categories,
    totals: {
      spent: totalSpentCents / 100,
      income: totalIncomeCents / 100,
    },
  });
});

module.exports = router;
