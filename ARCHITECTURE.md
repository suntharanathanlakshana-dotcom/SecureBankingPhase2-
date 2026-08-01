# Architecture — From Phase 1 Blueprint to Phase 2 Demo

Phase 1 specified a production architecture: Java/Spring Boot microservices on Azure
Kubernetes Service, behind Azure Front Door/WAF and API Management, communicating over
Azure Service Bus, backed by Azure SQL/Cosmos DB, with a geo-replicated disaster-recovery
region. This document explains how that design maps to what's actually running in this
repository, and what would need to change to go from demo to production.

## Mapping table

| Phase 1 (production design) | Phase 2 (this demo) | Why |
|---|---|---|
| Java 21 + Spring Boot microservices | Node.js/Express route modules | Zero-install, runs anywhere `node` runs; each route module still owns one capability (Auth, Accounts, Transfers, …) so the service *boundary* is preserved even though the *process* boundary is not. |
| Azure Kubernetes Service (independent pods per service) | Single Node process | A judging environment can't provision a Kubernetes cluster; the modular route structure means each module could be `docker run` independently with minimal changes. |
| Azure API Management / Front Door + WAF | Express app + CORS + JWT middleware | Same role (single entry point, auth enforcement) at a scale appropriate for a demo. |
| Azure Service Bus / Event Grid (async, event-driven) | Direct function calls within route handlers | The demo is synchronous for simplicity; the fraud check, notification write, and transaction write happen as one code path but are already separated into distinct functions/tables that could be decoupled behind a queue later. |
| Azure SQL + Cosmos DB (polyglot, per-service data) | Single SQLite file, tables grouped by owning service | SQLite needs no server process to install/run; table comments in `db.js` mark which "service" owns each table, keeping the boundary explicit in code even though it's physically one file. |
| Azure AD B2C (OAuth2/OIDC, MFA) | Custom JWT auth + OTP + WebAuthn | Implements the same two-factor guarantee (password + second factor) without requiring an Azure tenant to demo. |
| Fingerprint/Face ID via Android BiometricPrompt / iOS LocalAuthentication | **Real WebAuthn** via the browser's platform authenticator | This is not simulated — `routes/webauthn.js` and `Login.jsx`/`Security.jsx` use the actual [WebAuthn](https://www.w3.org/TR/webauthn-2/) standard, so on a laptop with Windows Hello or Touch ID (or an Android phone with a fingerprint sensor), the biometric prompt in the demo is the real OS-level prompt. Biometric data never reaches the server, exactly as specified in Phase 1. |
| Azure Dedicated HSM (Master Key custody) | Environment variable `JWT_SECRET` | A stand-in for key custody; in production this signing key would live in Key Vault/HSM, never in `.env`. |
| Azure Machine Learning fraud scoring | Rule-based scoring in `utils/fraud.js` | Explainable rules (large-amount, velocity, high-value cardless withdrawal) wired in at exactly the point a trained model would sit — swapping in a real model later means replacing the contents of one function, not re-plumbing the transaction flow. |
| LankaPay CEFTS / SLIPS / LankaQR | `channel` field on each transaction (`CEFTS`, `SLIPS`, `LankaQR`, `ATM`, `USSD`) | The demo doesn't call the real national switch (no sandbox access), but every transaction is tagged with which rail it would travel over, and the UI presents the same channel choices as Phase 1's wireframes. |
| ISO 8583 ATM messaging + OTP extension | `POST /api/cardless/redeem` (simulated ATM terminal) | Implements the same request/response shape (terminal ID + code → dispense) described in Phase 1, without a real ATM switch. |
| Azure Site Recovery / geo-replication / paired regions | Not implemented (infrastructure, not application code) | Out of scope for a local demo; `README.md` "Known Limitations" and the Phase 1 document describe the intended production DR posture (RTO ≤ 15 min, RPO ≤ 5 min). |
| Azure Monitor / Sentinel (SIEM) | `audit_log` table + `middleware/audit.js` + console request log | Every sensitive action (login, transfer, freeze, dispute status change, biometric registration) is written to an immutable-in-spirit audit table, exportable as CSV from the admin Reports page — the same shape a SIEM ingestion pipeline would consume. |
| WAF / API Management throttling policies | `helmet()` + `middleware/rateLimit.js` (`express-rate-limit`) | Same role at demo scale: security headers on every response, a generous global request ceiling, and a much tighter ceiling on auth/OTP/biometric endpoints to blunt credential-guessing. A production deployment would back this with Redis so limits are shared across instances. |
| CI/CD pipeline (build, test, deploy gates) | `.github/workflows/ci.yml` (GitHub Actions) | Lints and runs the Jest/Supertest suite on every push/PR, and confirms the frontend still builds — the same gate a production pipeline would enforce before a deploy step. |

## Request flow (as implemented)

```
Browser (React)
   │  fetch('/api/...')  — Vite dev proxy in dev, same-origin in prod build
   ▼
Express app (server.js)
   │  cors() → express.json() → request logger
   ▼
Route module (e.g. routes/transfers.js)
   │  requireAuth (JWT) → business logic → utils/fraud.js → utils/otp.js
   ▼
db.js (better-sqlite3, prepared statements)
   │  writes: transactions, accounts, notifications, audit_log
   ▼
Response → React state → UI
```

## Design tokens ("The Vault Reopens")

The frontend deliberately avoids generic fintech-blue-gradient or cream/terracotta AI
defaults. The visual concept is a **ledger reopening after a blackout**: a near-black ink
navy surface, a single restored-power amber accent, and monospace type for anything that is
literally a number a customer has to trust — balances, account numbers, OTP/withdrawal
codes — so those values read like they've been stamped into a ledger rather than styled as
decoration. See `frontend/src/styles.css` for the full token set (`:root` custom
properties).

## What changes for a real production deployment

1. Split each `routes/*.js` module into its own deployable service (Spring Boot, per Phase
   1), each with its own datastore.
2. Replace direct function calls between fraud/notification/transaction logic with
   published events on a message bus, consumed asynchronously.
3. Move OTP delivery to a real SMS/push provider; remove `demoOtp` from all API responses.
4. Move signing keys and secrets into Key Vault/HSM; rotate `JWT_SECRET` out of `.env`.
5. Stand up the DR region, geo-replication, and automated failover described in Phase 1.
6. Replace the rule-based fraud engine with a trained model served behind the same
   `scoreTransaction()` call signature.
7. Integrate with the real LankaPay switch (CEFTS/SLIPS/LankaQR) and an ATM switch (ISO
   8583) instead of the in-app simulations.
