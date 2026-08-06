// utils/limits.js
// Central place for the two account-wide money rules requested for Phase 2:
//   1. Every account must always retain a minimum balance of Rs. 100.00
//   2. Every outgoing (debit) transaction carries a flat Rs. 25.00 service fee
// Keeping these in one module means every route (transfers, bills, QR, cardless
// ATM, loan repayment) enforces the same numbers instead of re-deriving them.

const MIN_BALANCE_CENTS = 10000; // Rs. 100.00
const TRANSACTION_FEE_CENTS = 2500; // Rs. 25.00

const MIN_BALANCE_RS = MIN_BALANCE_CENTS / 100;
const TRANSACTION_FEE_RS = TRANSACTION_FEE_CENTS / 100;

/**
 * Checks whether a debit of `amountCents` (plus the flat transaction fee) can be taken
 * from `account` without breaching the minimum-balance rule.
 * Returns { ok, totalCents, remainingCents } where totalCents is amount + fee — the
 * actual amount that must be deducted from balance_cents if the debit proceeds.
 */
function checkDebit(account, amountCents, feeCents = TRANSACTION_FEE_CENTS) {
  const totalCents = amountCents + feeCents;
  const remainingCents = account.balance_cents - totalCents;
  return { ok: remainingCents >= MIN_BALANCE_CENTS, totalCents, remainingCents };
}

function insufficientBalanceMessage() {
  return `Insufficient balance — a Rs. ${TRANSACTION_FEE_RS.toFixed(2)} transaction fee applies and a minimum balance of Rs. ${MIN_BALANCE_RS.toFixed(2)} must remain in the account.`;
}

module.exports = {
  MIN_BALANCE_CENTS,
  TRANSACTION_FEE_CENTS,
  MIN_BALANCE_RS,
  TRANSACTION_FEE_RS,
  checkDebit,
  insufficientBalanceMessage,
};
