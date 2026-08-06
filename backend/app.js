// app.js — builds and exports the Express app without binding a port.
// Split out from server.js so tests (Supertest) can exercise the app in-process,
// and so a future container entrypoint can mount this app behind any listener.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

require("./db"); // initializes schema + seed data on first run

const { globalLimiter, authLimiter } = require("./middleware/rateLimit");

const app = express();

// Security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, etc.) — the
// application-layer equivalent of the WAF/edge hardening described in Phase 1.
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic request log for the demo (stands in for centralized logging -> Azure Monitor/Sentinel)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "test") {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// Global ceiling on all API traffic, tighter limit specifically on credential/OTP-guessing
// surfaces (login, registration, biometric ceremonies, cardless code redemption).
app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/webauthn", authLimiter);
app.use("/api/cardless/redeem", authLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "securebank-api", time: new Date().toISOString() }));

// ---- Route modules (each represents an independent "service" boundary per Phase 1 design) ----
app.use("/api/auth", require("./routes/auth"));
app.use("/api/webauthn", require("./routes/webauthn"));
app.use("/api/accounts", require("./routes/accounts").router);
app.use("/api/transfers", require("./routes/transfers"));
app.use("/api/bills", require("./routes/bills"));
app.use("/api/loans", require("./routes/loans"));
app.use("/api/cardless", require("./routes/cardless"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/support", require("./routes/support"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/ussd", require("./routes/ussd"));
app.use("/api/scheduled-transfers", require("./routes/scheduledTransfers"));
app.use("/api/fraud", require("./routes/fraud"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/virtual-cards", require("./routes/virtualCards"));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
