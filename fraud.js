// utils/fraud.js
// Demo stand-in for the Phase-1 "Fraud Detection Service (AI/ML)". Uses transparent,
// explainable rules rather than a trained model, but is wired in at the same point in the
// flow (before a transaction is committed) so swapping in a real model later is a drop-in change.

const db = require("../db");

const LARGE_TX_THRESHOLD_CENTS = 10000000; // Rs 100,000
const VELOCITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const VELOCITY_MAX_COUNT = 3;

function scoreTransaction({ accountId, amountCents, type }) {
  let score = 0;
  const reasons = [];

  if (amountCents >= LARGE_TX_THRESHOLD_CENTS) {
    score += 40;
    reasons.push("large transaction amount");
  }

  // IMPORTANT: the window boundary must be computed by SQLite's own datetime(), not JS's
  // toISOString(). created_at is stored as SQLite's 'YYYY-MM-DD HH:MM:SS' (space-separated,
  // no 'T'/'Z'); comparing that against a JS ISO-8601 string in a plain TEXT comparison
  // silently returns the wrong answer almost every time because 'T' > ' ' lexicographically.
  const windowMinutes = Math.round(VELOCITY_WINDOW_MS / 60000);
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS c FROM transactions
       WHERE account_id = ? AND type = ? AND created_at >= datetime('now', ?)`
    )
    .get(accountId, type, `-${windowMinutes} minutes`);
  if (recent.c >= VELOCITY_MAX_COUNT) {
    score += 35;
    reasons.push("high transaction velocity");
  }

  if (type === "atm_withdrawal" && amountCents >= 5000000) {
    score += 15;
    reasons.push("high-value cardless withdrawal");
  }

  const blocked = score >= 70;
  return { score, blocked, reason: reasons.join("; ") || null };
}

// ---- AI-powered fraud explanation ----------------------------------------------------
// Demo stand-in for the Phase-1 "explainable AI" requirement on the Fraud Detection
// Service. Turns the rule engine's terse, machine-oriented `reason` string (e.g. "large
// transaction amount; high transaction velocity") into a plain-language explanation a
// customer or back-office agent can actually read, without hiding which specific signals
// fired. Because the underlying rules are transparent (see scoreTransaction above), this
// is a template-driven natural-language layer over real, inspectable signals — not a
// black box — so every sentence traces back to a rule the reader can verify.
const EXPLANATION_TEMPLATES = {
  "large transaction amount": (ctx) =>
    `the amount${ctx.amountLabel ? ` (${ctx.amountLabel})` : ""} is unusually large compared to typical activity on this account`,
  "high transaction velocity": () =>
    "this account has sent an unusually high number of transactions in a very short window, a pattern often seen when a card or session has been compromised",
  "high-value cardless withdrawal": () =>
    "this is a high-value cardless ATM withdrawal, a channel fraud rings target because cash can't be reversed once dispensed",
};

function explainFraud({ score, reason, blocked, amountCents, type }) {
  const amountLabel = amountCents != null ? `Rs. ${(amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null;
  const reasonKeys = (reason || "")
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);

  if (reasonKeys.length === 0) {
    return `This ${type ? type.replace(/_/g, " ") : "transaction"} scored ${score}/100 on our fraud model and did not trigger any risk signals — it matches this account's normal spending pattern, so no action is needed.`;
  }

  const sentences = reasonKeys.map((key) => EXPLANATION_TEMPLATES[key]?.({ amountLabel }) || key);
  const bullets = sentences.map((s) => `- ${s}.`).join("\n");

  const verdict = blocked
    ? `Because the combined risk score (${score}/100) crossed our block threshold, this transaction was stopped before it could complete. You can retry with a smaller amount, wait a few minutes for transaction velocity to reset, or contact support if this was legitimate.`
    : `The combined risk score (${score}/100) was elevated but stayed below our block threshold, so this transaction went through — it's flagged for review rather than blocked.`;

  return `This transaction was scored ${score}/100 by our fraud model based on the following signal(s):\n${bullets}\n\n${verdict}`;
}

module.exports = { scoreTransaction, explainFraud };
