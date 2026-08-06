const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount, fmtAccount } = require("./accounts");
const { MIN_BALANCE_CENTS } = require("../utils/limits");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const loans = db.prepare(`SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC`).all(req.user.sub);
  res.json({ loans: loans.map(fmtLoan) });
});

// FR-06: apply -> instant pre-approval simulation (simple affordability rule)
router.post("/apply", requireAuth, (req, res) => {
  const { accountId, amount, termMonths, purpose } = req.body || {};
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const principalCents = Math.round(Number(amount) * 100);
  if (!principalCents || principalCents <= 0) return res.status(400).json({ error: "Enter a valid loan amount" });
  const term = Number(termMonths) || 12;

  // Simple affordability heuristic: pre-approve if requested principal <= 5x current balance
  const approved = principalCents <= account.balance_cents * 5;
  const status = approved ? "approved" : "pending";

  const loanId = uuid();
  db.prepare(
    `INSERT INTO loans (id, user_id, account_id, principal_cents, outstanding_cents, term_months, purpose, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(loanId, req.user.sub, account.id, principalCents, principalCents, term, purpose || "General", status);

  if (approved) {
    db.prepare(`UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?`).run(principalCents, account.id);
    db.prepare(
      `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
       VALUES (?, ?, 'loan_disbursement', 'SecureBank Loans', ?, 'INTERNAL', 'completed')`
    ).run(uuid(), account.id, principalCents);
  }

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, severity) VALUES (?, ?, ?, ?, 'info')`
  ).run(
    uuid(),
    req.user.sub,
    approved ? "Loan approved" : "Loan application received",
    approved
      ? `Your loan of Rs. ${(principalCents / 100).toFixed(2)} was pre-approved and disbursed.`
      : `Your loan application for Rs. ${(principalCents / 100).toFixed(2)} is under manual review.`
  );

  logAction(req.user.sub, "loan_application", { loanId, principalCents, status }, req.ip);
  res.status(201).json({ loan: fmtLoan(db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId)) });
});

// FR-06: repayment
router.post("/:id/repay", requireAuth, (req, res) => {
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.sub);
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (loan.status !== "approved" && loan.status !== "active") return res.status(400).json({ error: "Loan is not active" });

  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(loan.account_id);
  const amountCents = Math.round(Number(req.body?.amount || 0) * 100);
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Enter a valid repayment amount" });
  if (account.balance_cents - amountCents < MIN_BALANCE_CENTS) {
    return res.status(400).json({ error: `Insufficient balance — a minimum balance of Rs. ${(MIN_BALANCE_CENTS / 100).toFixed(2)} must remain in the account.` });
  }

  const newOutstanding = Math.max(0, loan.outstanding_cents - amountCents);
  db.prepare(`UPDATE loans SET outstanding_cents = ?, status = ? WHERE id = ?`).run(
    newOutstanding,
    newOutstanding === 0 ? "closed" : "active",
    loan.id
  );
  db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(amountCents, account.id);
  db.prepare(
    `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
     VALUES (?, ?, 'loan_repayment', 'SecureBank Loans', ?, 'INTERNAL', 'completed')`
  ).run(uuid(), account.id, amountCents);

  logAction(req.user.sub, "loan_repayment", { loanId: loan.id, amountCents }, req.ip);
  res.json({ loan: fmtLoan(db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loan.id)), feeCharged: 0 });
});

function fmtLoan(l) {
  return {
    id: l.id,
    principal: l.principal_cents / 100,
    outstanding: l.outstanding_cents / 100,
    interestRate: l.interest_rate,
    termMonths: l.term_months,
    status: l.status,
    purpose: l.purpose,
    createdAt: l.created_at,
  };
}

module.exports = router;
