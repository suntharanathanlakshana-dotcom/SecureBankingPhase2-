// middleware/rateLimit.js
// Stands in for the Phase-1 edge layer's brute-force/DDoS protection (WAF + API Management
// throttling policies). In-memory here since this is a single demo process; a real
// multi-instance deployment would back this with Redis so limits are shared across pods.

const rateLimit = require("express-rate-limit");

// The automated test suite makes many rapid requests against the same in-memory limiter
// buckets; skipping here (rather than removing the middleware from the request pipeline)
// means the exact same route wiring is exercised in tests as in production.
const skip = () => process.env.NODE_ENV === "test";

// Applies to every request: a generous ceiling mainly meant to blunt scripted abuse.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "Too many requests. Please try again later." },
});

// Applies to authentication / MFA endpoints: password guessing, OTP guessing, and
// registration spam all live behind a much tighter limit than general API traffic.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "Too many attempts. Please wait a few minutes before trying again." },
});

module.exports = { globalLimiter, authLimiter };
