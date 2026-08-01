# SecureBank — User Guide

This guide walks through every screen of the SecureBank demo, in the order a new customer
(and then a bank administrator) would encounter them. For setup instructions, see
[`README.md`](./README.md).

---

## 1. Creating an account

Go to **/register** and fill in your name, a username, email, phone number, NIC, and a
password (8+ characters). On submit, SecureBank:
- creates your customer profile,
- opens a savings account with a generated account number, and
- sends a welcome notification confirming your account was "securely migrated from
  backup" — mirroring the Phase 1 scenario where customer data survived the disaster and
  just needed to be safely re-linked.

You're redirected to the login page.

## 2. Logging in

**/login** asks for your username and password first. Once that's verified, you're required
to complete a **second factor** before you get a session:

- **One-Time Code (OTP)** — shown directly on screen in this demo (clearly marked "Demo
  mode"). In production this would arrive by SMS/push instead.
- **Fingerprint / Face ID** — if you've registered a biometric credential (see §8), a
  button appears offering to use it instead of typing the OTP. This triggers your actual
  device's fingerprint/Face ID/Windows Hello prompt — it's real WebAuthn, not a mockup.

Demo accounts:
| Role | Username | Password |
|---|---|---|
| Customer | `nimasha` | `Password123!` |
| Admin | `admin` | `AdminPass123!` |

## 3. Dashboard

Your home screen shows:
- **Balance card** — current balance, account number, and a "CARD FROZEN" flag if you've
  frozen your card (see §8).
- **Quick actions** — jump straight to Transfer, Pay Bills, ATM Code, or Loans.
- **Fraud banner** — appears only if a recent transaction was flagged or blocked by the
  fraud engine, so you never have to go looking for it.
- **Recent transactions** — your last 6 transactions; click "See all" for the full
  statement.

## 4. Transferring money

**/transfer** is a 3-step flow, matching the Phase 1 wireframe exactly:
1. **Details** — choose the destination account, amount, and method (Instant/CEFTS or
   Standard/SLIPS).
2. **Verify** — the system runs a fraud pre-check (shown to you as a score out of 100) and
   sends an OTP. Enter it to confirm.
3. **Done** — see your new balance and a transaction reference number.

If the fraud engine's score crosses the block threshold, the transfer is refused outright
and you'll see why (e.g. "high transaction velocity").

## 5. Paying bills & merchants (QR)

**/bills** has two tabs:
- **Bill Payment** — pick a biller (CEB, water board, telecom, etc.), enter your reference
  number and amount.
- **LankaQR Pay** — simulates scanning a merchant's QR code and paying them directly.

## 6. Loans

**/loans** lets you apply for a loan (amount, term, purpose). Requests within your
affordability profile are **pre-approved and disbursed instantly**; larger requests are
marked pending for manual review. You can make repayments against any active loan from the
same screen — each repayment reduces the outstanding balance and is drawn from your
account.

## 7. Cardless ATM withdrawal

This is the flow highlighted in Phase 1 as an alternative to card-based withdrawals.

1. Go to **/cardless**, choose your account, amount, and a nearby ATM.
2. **Confirm your identity** — tap "Fingerprint / Face ID" (real WebAuthn prompt) or enter
   your app PIN as a fallback.
3. Tap **Generate Withdrawal Code** — you'll get a 6-digit, single-use code with a 5-minute
   countdown, plus a link to open the ATM simulator.
4. Open **/atm** (works in a separate browser tab, deliberately unauthenticated — like a
   real ATM terminal) and choose the same ATM location.
5. Enter the 6-digit code on the on-screen keypad and press **OK**. The simulator confirms
   the amount dispensed; the code is immediately voided so it can't be reused.

## 8. Security settings

**/security** has two sections:
- **Fingerprint & Face ID** — tap "Register this device" to enroll your platform
  authenticator (Windows Hello / Touch ID / Android biometric). Once registered, it appears
  as a login option and as an identity-confirmation option for cardless withdrawals.
- **Card Controls** — freeze your card instantly (blocks transfers, bill payments, and
  cardless withdrawals from that account) and unfreeze it when you're ready.

## 9. Notifications

**/notifications** lists every alert generated for your account — transfers, bill payments,
loan approvals, cardless withdrawals, and fraud warnings — newest first. Unread items can be
marked as read individually.

## 10. Support & disputes

**/support** lets you file a new support request or dispute (subject + description) and
see the status of any case you've already opened (open → investigating → resolved/rejected).
Admins manage and update these from the back office (§12).

## 11. USSD (feature-phone) channel

**/ussd-demo** simulates dialing `*123#` from a phone with no app and no internet — for
customers without a smartphone, per Phase 1's inclusive-access requirement. Enter your
registered phone number, dial, then navigate the text menu (balance check, mini statement,
or a transfer) exactly as a feature-phone user would using their phone's numeric keys.

## 12. Admin / back office

Log in as `admin` to see an extra **Back Office** section in the sidebar:
- **Overview** — platform-wide stats: customers, accounts, total deposits, today's
  transaction count, transactions blocked by fraud screening, open disputes.
- **Users** — every registered user; freeze/unfreeze any customer's account.
- **Transactions** — the full ledger across all customers.
- **Fraud Alerts** — every transaction the fraud engine scored ≥ 30, with the specific
  reason(s) it was flagged.
- **Disputes** — review and update the status of customer-filed disputes.
- **Reports** — a transaction summary grouped by type/channel/status, a form to file
  IT/cybersecurity incident reports (per CBSL Circular No. 2 of 2025), and a one-click CSV
  export of the full audit trail.

---

## Tips for demoing this to judges

- Show the **cardless ATM flow end-to-end** in two tabs side by side (app → ATM) — it's the
  most visually convincing proof that the Phase 1 design actually works.
- Register a real biometric credential on your laptop/phone before presenting, so the
  fingerprint/Face ID prompts are genuine OS dialogs, not placeholders.
- Trigger a fraud block on purpose by sending several rapid transfers in a row (velocity
  rule) or one very large transfer (amount rule) to show the blocking + notification flow.
- Log in as `admin` afterward to show the same blocked transaction appearing in **Fraud
  Alerts**, tying the customer-facing and back-office experiences together.
