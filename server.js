// server.js — process entrypoint. Boots the Express app built in app.js and binds a port.
// Kept separate from app.js so tests can import the app without opening a socket.

const app = require("./app");
const { runDueScheduledTransfers } = require("./utils/scheduledTransfers");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`SecureBank API listening on http://localhost:${PORT}`);
});

// Periodic tick that executes any scheduled/recurring transfers that have come due.
// The list endpoint also runs this opportunistically, so this timer mainly keeps
// schedules current even while nobody has the app open.
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    try {
      runDueScheduledTransfers();
    } catch (e) {
      console.error("Scheduled transfer run failed:", e);
    }
  }, 60 * 1000);
}
