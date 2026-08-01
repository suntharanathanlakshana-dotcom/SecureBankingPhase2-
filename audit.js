const { v4: uuid } = require("uuid");
const db = require("../db");

function logAction(userId, action, detail, ip) {
  db.prepare(
    `INSERT INTO audit_log (id, user_id, action, detail, ip) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), userId || null, action, detail ? JSON.stringify(detail) : null, ip || null);
}

module.exports = { logAction };
