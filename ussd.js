// routes/ussd.js
// Simulates a USSD session (e.g. dialing *123#) for feature-phone / low-connectivity access,
// per FR-11 (Multi-Channel / Inclusive Access). Real deployments sit behind a telco USSD
// gateway that POSTs the dialed digits turn-by-turn; this mirrors that request/response shape
// so the same session logic could be pointed at a real gateway later.

const express = require("express");
const db = require("../db");

const router = express.Router();
const sessions = new Map(); // sessionId -> { step, userId, accountId }

router.post("/", (req, res) => {
  const { sessionId, phoneNumber, text } = req.body || {};
  const input = (text || "").split("*").filter(Boolean);
  let session = sessions.get(sessionId) || { step: "phone_lookup" };

  const user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phoneNumber);

  if (!text) {
    sessions.set(sessionId, { step: "pin" });
    return res.send(reply("CON Welcome to SecureBank USSD\nEnter your 4-digit PIN:"));
  }

  if (!user) {
    return res.send(reply("END This phone number is not registered with SecureBank."));
  }

  const lastInput = input[input.length - 1];

  if (session.step === "pin") {
    // Demo: any 4-digit PIN matching last 4 digits of the account's password hash char codes is
    // out of scope — for the simulator we just accept any 4-digit numeric PIN.
    if (!/^\d{4}$/.test(lastInput)) return res.send(reply("END Invalid PIN format."));
    session = { step: "menu", userId: user.id };
    sessions.set(sessionId, session);
    return res.send(
      reply(
        "CON SecureBank USSD Menu\n1. Check Balance\n2. Mini Statement\n3. Transfer Money\n4. Buy Airtime\n0. Exit"
      )
    );
  }

  if (session.step === "menu") {
    const account = db.prepare(`SELECT * FROM accounts WHERE user_id = ?`).get(session.userId);
    if (lastInput === "1") {
      return res.send(reply(`END Your balance is Rs. ${(account.balance_cents / 100).toFixed(2)}.`));
    }
    if (lastInput === "2") {
      const txs = db
        .prepare(`SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 3`)
        .all(account.id);
      const lines = txs
        .map((t) => `${t.type} Rs.${(t.amount_cents / 100).toFixed(0)}`)
        .join("\n");
      return res.send(reply(`END Last transactions:\n${lines || "No recent activity"}`));
    }
    if (lastInput === "3") {
      session.step = "transfer_amount";
      sessions.set(sessionId, session);
      return res.send(reply("CON Enter amount to transfer (Rs.):"));
    }
    if (lastInput === "4") {
      return res.send(reply("END Airtime top-up is not yet available in this demo."));
    }
    return res.send(reply("END Goodbye."));
  }

  if (session.step === "transfer_amount") {
    session.amount = Number(lastInput);
    session.step = "transfer_target";
    sessions.set(sessionId, session);
    return res.send(reply("CON Enter recipient account number:"));
  }

  if (session.step === "transfer_target") {
    const account = db.prepare(`SELECT * FROM accounts WHERE user_id = ?`).get(session.userId);
    const amountCents = Math.round((session.amount || 0) * 100);
    if (amountCents > 0 && amountCents <= account.balance_cents) {
      db.prepare(`UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?`).run(amountCents, account.id);
      db.prepare(
        `INSERT INTO transactions (id, account_id, type, counterparty, amount_cents, channel, status)
         VALUES (?, ?, 'transfer_out', ?, ?, 'USSD', 'completed')`
      ).run(require("uuid").v4(), account.id, lastInput, amountCents);
      sessions.delete(sessionId);
      return res.send(reply(`END Rs. ${session.amount.toFixed(2)} sent to ${lastInput}.`));
    }
    sessions.delete(sessionId);
    return res.send(reply("END Transfer failed: insufficient balance."));
  }

  return res.send(reply("END Session error. Please dial again."));
});

function reply(text) {
  return text;
}

module.exports = router;
