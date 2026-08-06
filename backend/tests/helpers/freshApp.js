// tests/helpers/freshApp.js
//
// Every test file gets its OWN SQLite database file (rather than sharing
// backend/securebank.db) so test runs never depend on run order, never touch the real
// dev database, and can be deleted afterwards without affecting anything else.

const path = require("path");
const fs = require("fs");
const request = require("supertest");

function cleanup(dbPath) {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch (_e) {
      // file may not exist yet — that's fine
    }
  }
}

/**
 * Boots a fresh app instance against a fresh, isolated SQLite file.
 * @param {string} suiteName - unique-ish name, becomes the db filename
 * @returns {{ app: import('express').Express, dbPath: string, teardown: () => void }}
 */
function freshApp(suiteName) {
  const dbPath = path.join(__dirname, `../../${suiteName}.test.db`);
  cleanup(dbPath);
  process.env.DB_PATH = dbPath;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret";

  jest.resetModules(); // force db.js and every route module to re-require against the new DB_PATH
  const app = require("../../app");

  return {
    app,
    dbPath,
    teardown: () => cleanup(dbPath),
  };
}

/**
 * Walks the real two-step login flow (password -> OTP) using the demoOtp the API returns,
 * exactly the way the frontend does, and returns a ready-to-use bearer token.
 */
async function loginAs(app, username, password) {
  const step1 = await request(app).post("/api/auth/login").send({ username, password });
  if (step1.status !== 200) {
    throw new Error(`login step 1 failed: ${step1.status} ${JSON.stringify(step1.body)}`);
  }
  const step2 = await request(app)
    .post("/api/auth/login/verify-otp")
    .send({ preAuthToken: step1.body.preAuthToken, code: step1.body.demoOtp });
  if (step2.status !== 200) {
    throw new Error(`login step 2 failed: ${step2.status} ${JSON.stringify(step2.body)}`);
  }
  return { token: step2.body.token, user: step2.body.user };
}

module.exports = { freshApp, loginAs };
