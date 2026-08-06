// routes/virtualCards.js
// Virtual debit card (Phase 2 stand-out feature). A customer can spin up an instant,
// number-visible-in-app card for online spending without waiting for a physical card to
// arrive in the mail. Full card number/CVV are only ever revealed after a fresh OTP step
// (same MFA pattern used for transfers/cardless ATM), and every other response returns a
// masked number — the same "least privilege at the API boundary" approach used elsewhere.

const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/audit");
const { getOwnedAccount } = require("./accounts");
const { generateOtp, verifyOtp } = require("../utils/otp");

const router = express.Router();

const DEFAULT_LIMIT_CENTS = 5000000; // Rs 50,000
const MAX_LIMIT_CENTS = 50000000; // Rs 500,000

function luhnCheckDigit(digitsWithoutCheck) {
  let sum = 0;
  let double = true;
  for (let i = digitsWithoutCheck.length - 1; i >= 0; i--) {
    let d = Number(digitsWithoutCheck[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

function generateCardNumber() {
  // 15 random digits under the demo BIN "4915" (a Visa-format test range) + Luhn check digit.
  let digits = "4915";
  for (let i = 0; i < 11; i++) digits += Math.floor(Math.random() * 10);
  digits += luhnCheckDigit(digits);
  return digits;
}

function mask(cardNumber) {
  return `•••• •••• •••• ${cardNumber.slice(-4)}`;
}

function fmt(c) {
  return {
    id: c.id,
    accountId: c.account_id,
    maskedNumber: mask(c.card_number),
    cardholderName: c.cardholder_name,
    expiry: `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`,
    status: c.status,
    spendingLimit: c.spending_limit_cents / 100,
    createdAt: c.created_at,
  };
}

router.get("/", requireAuth, (req, res) => {
  const cards = db
    .prepare(
      `SELECT vc.* FROM virtual_cards vc
       JOIN accounts a ON a.id = vc.account_id
       WHERE a.user_id = ? AND vc.status != 'terminated'
       ORDER BY vc.created_at DESC`
    )
    .all(req.user.sub);
  res.json({ cards: cards.map(fmt) });
});

router.post("/generate", requireAuth, (req, res) => {
  const { accountId } = req.body || {};
  const account = getOwnedAccount(req.user.sub, accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const existing = db
    .prepare(`SELECT id FROM virtual_cards WHERE account_id = ? AND status != 'terminated'`)
    .get(account.id);
  if (existing) return res.status(409).json({ error: "This account already has an active virtual card. Terminate it before creating a new one." });

  const user = db.prepare(`SELECT full_name FROM users WHERE id = ?`).get(req.user.sub);
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 3);

  const id = uuid();
  db.prepare(
    `INSERT INTO virtual_cards (id, account_id, card_number, cardholder_name, expiry_month, expiry_year, cvv, spending_limit_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    account.id,
    generateCardNumber(),
    user.full_name.toUpperCase(),
    expiry.getMonth() + 1,
    expiry.getFullYear(),
    String(Math.floor(100 + Math.random() * 900)),
    DEFAULT_LIMIT_CENTS
  );

  logAction(req.user.sub, "virtual_card_generated", { cardId: id, accountId: account.id }, req.ip);
  const row = db.prepare(`SELECT * FROM virtual_cards WHERE id = ?`).get(id);
  res.status(201).json({ message: "Virtual card created", card: fmt(row) });
});

function getOwnedCard(userId, cardId) {
  return db
    .prepare(
      `SELECT vc.* FROM virtual_cards vc JOIN accounts a ON a.id = vc.account_id
       WHERE vc.id = ? AND a.user_id = ?`
    )
    .get(cardId, userId);
}

router.post("/:id/freeze", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  db.prepare(`UPDATE virtual_cards SET status = 'frozen' WHERE id = ?`).run(card.id);
  logAction(req.user.sub, "virtual_card_frozen", { cardId: card.id }, req.ip);
  res.json({ message: "Virtual card frozen" });
});

router.post("/:id/unfreeze", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  db.prepare(`UPDATE virtual_cards SET status = 'active' WHERE id = ?`).run(card.id);
  logAction(req.user.sub, "virtual_card_unfrozen", { cardId: card.id }, req.ip);
  res.json({ message: "Virtual card unfrozen" });
});

router.post("/:id/terminate", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  db.prepare(`UPDATE virtual_cards SET status = 'terminated' WHERE id = ?`).run(card.id);
  logAction(req.user.sub, "virtual_card_terminated", { cardId: card.id }, req.ip);
  res.json({ message: "Virtual card terminated" });
});

router.post("/:id/limit", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  const limitCents = Math.round(Number(req.body?.limit) * 100);
  if (!limitCents || limitCents <= 0 || limitCents > MAX_LIMIT_CENTS) {
    return res.status(400).json({ error: `Enter a limit between Rs. 1 and Rs. ${(MAX_LIMIT_CENTS / 100).toLocaleString()}` });
  }
  db.prepare(`UPDATE virtual_cards SET spending_limit_cents = ? WHERE id = ?`).run(limitCents, card.id);
  logAction(req.user.sub, "virtual_card_limit_changed", { cardId: card.id, limitCents }, req.ip);
  const row = db.prepare(`SELECT * FROM virtual_cards WHERE id = ?`).get(card.id);
  res.json({ message: "Spending limit updated", card: fmt(row) });
});

// Step 1: request reveal -> issues OTP (full number/CVV are sensitive; never returned
// without a fresh MFA step, same pattern as transfers/cardless ATM).
router.post("/:id/reveal/request", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  if (card.status !== "active") return res.status(400).json({ error: "Only an active card's details can be revealed" });
  const { code } = generateOtp(req.user.sub, "card_reveal");
  res.json({ message: "Verification required to view full card details", demoOtp: code });
});

// Step 2: confirm with OTP -> returns full card number/CVV once.
router.post("/:id/reveal/confirm", requireAuth, (req, res) => {
  const card = getOwnedCard(req.user.sub, req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });

  const otp = verifyOtp(req.user.sub, "card_reveal", req.body?.code);
  if (!otp.ok) return res.status(401).json({ error: otp.reason });

  logAction(req.user.sub, "virtual_card_revealed", { cardId: card.id }, req.ip);
  res.json({
    cardNumber: card.card_number,
    cvv: card.cvv,
    expiry: `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`,
    cardholderName: card.cardholder_name,
  });
});

module.exports = router;
