// db.js — SQLite data layer.
// In production (per Phase 1) each service owns its own datastore (Azure SQL / Cosmos DB).
// For this demo, a single SQLite file stands in for that polyglot data layer, with tables
// namespaced by the service that owns them so the boundary is still explicit in code.

const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "securebank.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
-- ===== Auth & Identity Service =====
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  nic TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',       -- customer | admin
  status TEXT NOT NULL DEFAULT 'active',        -- active | frozen
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  label TEXT DEFAULT 'Biometric credential',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,                        -- login_mfa | transfer | cardless_withdrawal
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Account Service =====
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_number TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'savings',
  balance_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'LKR',
  card_frozen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Transaction Service =====
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  type TEXT NOT NULL,          -- transfer_out | transfer_in | bill_payment | qr_payment | atm_withdrawal | loan_disbursement | loan_repayment
  counterparty TEXT,
  amount_cents INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'CEFTS',   -- CEFTS | SLIPS | LankaQR | ATM
  status TEXT NOT NULL DEFAULT 'completed', -- completed | blocked | pending
  fraud_score INTEGER NOT NULL DEFAULT 0,
  fraud_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Payments (Cardless ATM) =====
CREATE TABLE IF NOT EXISTS cardless_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  code TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  atm_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | dispensed | expired | voided
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Loan Service =====
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  principal_cents INTEGER NOT NULL,
  outstanding_cents INTEGER NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 12.5,
  term_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | active | closed
  purpose TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Notification Service =====
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info | warning | critical
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Support / Disputes =====
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  transaction_id TEXT REFERENCES transactions(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | investigating | resolved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Audit / Compliance (feeds CBSL-style reporting) =====
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incident_reports (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,      -- fraud | outage | data_integrity
  severity TEXT NOT NULL,      -- low | medium | high | critical
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Scheduled Transfers (Phase 1 completion) =====
CREATE TABLE IF NOT EXISTS scheduled_transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_number TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'CEFTS',
  frequency TEXT NOT NULL DEFAULT 'once',       -- once | weekly | monthly
  next_run_at TEXT NOT NULL,
  end_date TEXT,                                 -- optional cutoff for recurring schedules
  status TEXT NOT NULL DEFAULT 'active',         -- active | paused | cancelled | completed
  last_run_at TEXT,
  last_run_status TEXT,                          -- completed | failed:<reason>
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Virtual Debit Card (Phase 2 stand-out feature) =====
CREATE TABLE IF NOT EXISTS virtual_cards (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  card_number TEXT NOT NULL,                     -- demo only: a real deployment tokenizes/vaults this (PCI DSS)
  cardholder_name TEXT NOT NULL,
  expiry_month INTEGER NOT NULL,
  expiry_year INTEGER NOT NULL,
  cvv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',         -- active | frozen | terminated
  spending_limit_cents INTEGER NOT NULL DEFAULT 5000000, -- Rs 50,000 default monthly limit
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------------- Seed demo data (idempotent) ----------------
function seed() {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users").get();
  if (existing.c > 0) return;

  const insertUser = db.prepare(`INSERT INTO users
    (id, full_name, username, email, phone, nic, password_hash, role, language)
    VALUES (@id, @full_name, @username, @email, @phone, @nic, @password_hash, @role, @language)`);
  const insertAccount = db.prepare(`INSERT INTO accounts
    (id, user_id, account_number, account_type, balance_cents)
    VALUES (@id, @user_id, @account_number, @account_type, @balance_cents)`);
  const insertTx = db.prepare(`INSERT INTO transactions
    (id, account_id, type, counterparty, amount_cents, channel, status, fraud_score)
    VALUES (@id, @account_id, @type, @counterparty, @amount_cents, @channel, @status, @fraud_score)`);
  const insertNote = db.prepare(`INSERT INTO notifications
    (id, user_id, title, body, severity) VALUES (@id, @user_id, @title, @body, @severity)`);

  const demoUserId = uuid();
  insertUser.run({
    id: demoUserId,
    full_name: "Nimasha Perera",
    username: "nimasha",
    email: "nimasha@example.com",
    phone: "+94771234567",
    nic: "199512345678",
    password_hash: bcrypt.hashSync("Password123!", 10),
    role: "customer",
    language: "en",
  });

  const adminId = uuid();
  insertUser.run({
    id: adminId,
    full_name: "Bank Ops Admin",
    username: "admin",
    email: "admin@securebank.example",
    phone: "+94770000000",
    nic: "198800000000",
    password_hash: bcrypt.hashSync("AdminPass123!", 10),
    role: "admin",
    language: "en",
  });

  const accountId = uuid();
  insertAccount.run({
    id: accountId,
    user_id: demoUserId,
    account_number: "SB-4821-0092",
    account_type: "savings",
    balance_cents: 45832000, // Rs 458,320.00
  });

  insertTx.run({ id: uuid(), account_id: accountId, type: "transfer_in", counterparty: "Payroll — Acme Ltd", amount_cents: 18500000, channel: "CEFTS", status: "completed", fraud_score: 2 });
  insertTx.run({ id: uuid(), account_id: accountId, type: "bill_payment", counterparty: "Ceylon Electricity Board", amount_cents: 612000, channel: "SLIPS", status: "completed", fraud_score: 1 });
  insertTx.run({ id: uuid(), account_id: accountId, type: "qr_payment", counterparty: "Grocery Mart", amount_cents: 425000, channel: "LankaQR", status: "completed", fraud_score: 3 });

  insertNote.run({ id: uuid(), user_id: demoUserId, title: "Welcome to SecureBank", body: "Your account has been securely migrated from backup. All services are operational.", severity: "info" });

  if (process.env.NODE_ENV !== "test") {
    console.log("Seeded demo user -> username: nimasha / password: Password123!");
    console.log("Seeded admin user -> username: admin / password: AdminPass123!");
  }
}

seed();

module.exports = db;
