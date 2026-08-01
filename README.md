# SecureBank — Duothan 6.0 · Phase 02 (Rebuild)

> Team [Your Name] · IEEE Student Branch of NSBM · Duothan 6.0
> A working implementation of the Phase 1 blueprint: a secure, modular digital banking
> platform rebuilt after the 2065 "Super Malware Agent" cyber disaster.

This repository contains a **full-stack, end-to-end working demo** of the digital banking
platform designed in Phase 1 — implementing all 14 functional requirements (FR-01 through
FR-12, plus FR-02a Biometric Login and FR-05a Cardless ATM Withdrawal) from that document.

The Phase 1 design specified a production stack of **Java/Spring Boot microservices on
Azure**. That is not practical to stand up in a hackathon judging environment, so this
repository implements the **same architecture and security model** — independent service
boundaries, fraud screening on every transaction, MFA, biometric auth, disaster-recovery
thinking — on a stack that is trivial to install and run locally: **Node.js/Express +
SQLite** on the backend and **React + Vite** on the frontend. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for exactly how each demo component maps to the
Phase 1 Azure/Spring Boot design, and what would change for a production deployment.

For a walkthrough of what the app actually does screen by screen, see
[`USER_GUIDE.md`](./USER_GUIDE.md).

---

## Quick Start

### Requirements
- Node.js 18+ and npm
- Two terminal windows (one for the API, one for the web app)
- A Chromium/Edge/Safari browser with a platform authenticator (Windows Hello, Touch ID, or
  Android fingerprint/face unlock) if you want to try real biometric login — this is
  optional; OTP-based MFA and PIN fallback always work with no special hardware.

### 1. Start the backend API
```bash
cd backend
npm install
npm start
```
This starts the API on `http://localhost:4000`, creates `backend/securebank.db`
(SQLite) on first run, and seeds two demo accounts:

| Role     | Username | Password        |
|----------|----------|-----------------|
| Customer | `nimasha`| `Password123!`  |
| Admin    | `admin`  | `AdminPass123!` |

### 2. Start the frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser. The dev server proxies `/api/*` requests
to the backend automatically (see `frontend/vite.config.js`).

### 3. Log in
Use the demo customer credentials above. After the password step you'll be prompted for a
second factor:
- **OTP** — in this demo, the code is shown directly in the UI (a real deployment sends it
  by SMS/push via Azure Notification Hubs / Service Bus — see `ARCHITECTURE.md`).
- **Fingerprint / Face ID** — if your device/browser supports WebAuthn platform
  authenticators, register one first from **Security → Register this device**, then use the
  biometric button on the login screen.

### 4. Try the cardless ATM flow
1. Go to **Cardless ATM** in the app, request a withdrawal code (confirm with biometric or
   app PIN).
2. Open **http://localhost:5173/atm** in a new tab — this is the simulated physical ATM
   terminal.
3. Enter the 6-digit code on the ATM keypad and press **OK**. Cash is "dispensed" and the
   code is immediately voided.

### 5. Try the USSD (feature phone) channel
Open **http://localhost:5173/ussd-demo** to simulate dialing `*123#` from a phone without
a screen-based app — covers FR-11 (Multi-Channel / Inclusive Access).

### 6. Explore the back office
Log in as `admin` / `AdminPass123!` to see the admin sidebar: platform overview, user
management (freeze/unfreeze), all transactions, fraud alerts, disputes, and CBSL-style
regulatory reports (with CSV export).

---

## Project Structure

```
securebank/
├── backend/                  # Express + SQLite API ("independent services" as route modules)
│   ├── db.js                 # Schema + seed data
│   ├── app.js                 # Builds the Express app (routes, security middleware) — no listen()
│   ├── server.js              # Thin entrypoint: requires app.js, binds the port
│   ├── middleware/            # auth (JWT + live status check), rate limiting, audit logging
│   ├── utils/                 # OTP generator/verifier, rule-based fraud scoring
│   ├── routes/                 # auth, webauthn, accounts, transfers, bills, loans,
│   │                            # cardless, notifications, support, admin, reports, ussd
│   └── tests/                  # Jest + Supertest suite (see "Testing & CI" below)
├── frontend/                 # React + Vite single-page app
│   └── src/
│       ├── pages/             # One file per screen (Dashboard, Transfer, Cardless, …)
│       ├── pages/admin/       # Back-office console screens
│       ├── components/        # Shared layout (sidebar/topbar)
│       ├── api.js             # Fetch wrapper + JWT storage
│       ├── AuthContext.jsx    # Current-session state
│       └── styles.css         # Design tokens ("The Vault Reopens" — see ARCHITECTURE.md)
├── ARCHITECTURE.md            # How this demo maps to the Phase 1 Azure/Spring Boot design
├── USER_GUIDE.md              # Screen-by-screen usage guide
└── README.md                  # This file
```

## Functional Requirements Coverage

| FR | Requirement | Where in this repo |
|----|-------------|---------------------|
| FR-01 | Account Onboarding & Migration | `POST /api/auth/register` |
| FR-02 | Authentication & MFA | `POST /api/auth/login`, `/login/verify-otp` |
| FR-02a | Biometric Login | `routes/webauthn.js` + `Login.jsx`, `Security.jsx` |
| FR-03 | Account Management | `routes/accounts.js`, `Dashboard.jsx`, `Security.jsx` (freeze) |
| FR-04 | Fund Transfers | `routes/transfers.js`, `Transfer.jsx` |
| FR-05 | QR & Bill Payments | `routes/bills.js`, `Bills.jsx` |
| FR-05a | Cardless ATM Withdrawal | `routes/cardless.js`, `Cardless.jsx`, `AtmSimulator.jsx` |
| FR-06 | Loan Services | `routes/loans.js`, `Loans.jsx` |
| FR-07 | Real-Time Fraud Detection | `utils/fraud.js` (invoked by transfers/bills/cardless) |
| FR-08 | Notifications & Alerts | `routes/notifications.js`, `Notifications.jsx` |
| FR-09 | Customer Support & Disputes | `routes/support.js`, `Support.jsx` |
| FR-10 | Admin & Back-Office Console | `routes/admin.js`, `pages/admin/*` |
| FR-11 | Multi-Channel / Inclusive Access | `routes/ussd.js`, `Ussd.jsx` |
| FR-12 | Regulatory Reporting | `routes/reports.js`, `AdminReports.jsx` |

### Newly added in this round

| Feature | Where in this repo |
|---------|---------------------|
| Scheduled / recurring transfers | `routes/scheduledTransfers.js`, `utils/scheduledTransfers.js`, `ScheduledTransfers.jsx` |
| Login history | `GET /api/auth/login-history` (reuses `audit_log`), `Security.jsx` |
| Multi-language (English / Sinhala / Tamil) | `i18n/translations.js`, `LanguageContext.jsx`, language picker in `Settings.jsx` |
| AI-powered fraud explanation | `explainFraud()` in `utils/fraud.js`, `routes/fraud.js`, `FraudExplainButton.jsx` (used in `Statement.jsx` and `AdminFraud.jsx`) |
| Spending analytics dashboard | `routes/analytics.js`, `Analytics.jsx` |
| Virtual debit card | `routes/virtualCards.js`, `VirtualCard.jsx` |

## Engineering Practices Followed
- **Modular boundaries**: each Phase-1 "microservice" is a self-contained route module with
  its own responsibility, so splitting them into real separate services later is a
  refactor, not a rewrite.
- **Version control**: this repo is initialized with git from the first commit; see commit
  history for incremental, feature-scoped commits.
- **Separation of concerns**: frontend and backend are independent packages with their own
  `package.json`, communicating only over the documented REST API.
- **Security by default**: passwords hashed with bcrypt, JWT sessions, parameterized SQL
  (via `better-sqlite3` prepared statements — no string-concatenated queries), `helmet`
  security headers, rate limiting on all `/api` traffic (tighter on auth/OTP/biometric
  endpoints), and an audit log recording every sensitive action.
- **Live session status checks**: `requireAuth` re-checks the account's status in the
  database on every request rather than trusting the JWT payload alone — an admin freezing
  a customer's account takes effect immediately, even against tokens issued before the
  freeze, instead of waiting up to 12h for the token to expire naturally.
- **Explainable fraud logic**: `utils/fraud.js` uses transparent, documented rules rather
  than an opaque model, so graders (and future maintainers) can see exactly why a
  transaction was scored the way it was.

## Testing & CI

The backend has an automated Jest + Supertest suite covering the flows most likely to hide
real bugs — not just happy paths:

- **Auth**: registration validation/duplicates, password+OTP login, OTP replay rejection,
  route protection, pre-MFA tokens being rejected as full sessions.
- **Transfers & fraud screening**: successful transfer + balance update, wrong-OTP
  rejection, insufficient-balance rejection, and the velocity + large-amount fraud block.
- **Security**: an admin freeze invalidates an *already-issued* customer session
  immediately (not just new logins), and role-based access control on admin routes.
- **Smoke tests**: health check, JSON 404 handling.

Each test file runs against its own throwaway SQLite file (`backend/tests/helpers/freshApp.js`
resets modules and points `DB_PATH` at a fresh file per suite), so tests never touch the real
dev database and never depend on run order.

```bash
cd backend
npm install
npm test        # runs the full Jest suite
npm run lint     # ESLint
```

`.github/workflows/ci.yml` runs `npm run lint` and `npm test` for the backend, and
`npm run build` for the frontend, on every push and pull request.

> Writing this suite surfaced a real bug: the fraud engine's "high transaction velocity"
> rule compared a JS `Date.toISOString()` timestamp against SQLite's `datetime('now')`
> column format, and the string comparison silently evaluated false almost every time — so
> the velocity signal never actually fired in the running app. Fixed in `utils/fraud.js` by
> computing the time-window boundary with SQLite's own `datetime('now', '-N minutes')`
> instead, and now covered by a regression test (`tests/transfers.test.js`).

## Publishing to GitHub

```bash
git add -A
git commit -m "SecureBank — Duothan 6.0 Phase 2 submission"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
Make sure the repository visibility is set to **Public** before submitting the link.

## Known Limitations (demo scope)

- OTP codes are returned in the API response instead of being sent by SMS/push — clearly
  marked `DEMO ONLY` in the code and UI. Swapping in Twilio/Azure Notification Hubs is a
  contained change in `utils/otp.js`.
- SQLite stands in for the polyglot per-service data layer described in Phase 1 (Azure SQL
  + Cosmos DB); table names are grouped by owning service to keep that boundary visible.
- Fraud detection is rule-based, not a trained ML model — see `ARCHITECTURE.md` for the
  intended production upgrade path.
- Disaster-recovery, geo-replication, and Kubernetes deployment are described in Phase 1 and
  `ARCHITECTURE.md` but are infrastructure concerns out of scope for a local demo.
