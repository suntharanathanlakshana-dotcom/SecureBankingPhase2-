import { useEffect, useState } from "react";
import { api } from "../api";
import { SRI_LANKAN_BANKS } from "../constants/sriLankanBanks";
import { INVALID_ATTEMPT_MESSAGE } from "../utils/friendlyError";

const FREQUENCY_LABELS = { once: "One-time (future dated)", weekly: "Weekly", monthly: "Monthly" };

export default function ScheduledTransfers() {
  const [account, setAccount] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [bankName, setBankName] = useState(SRI_LANKAN_BANKS[0]);
  const [toAccountNumber, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("once");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.get("/scheduled-transfers").then((d) => setSchedules(d.scheduledTransfers)).catch(() => {});
  }

  useEffect(() => {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
    refresh();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/scheduled-transfers", {
        fromAccountId: account.id,
        toAccountNumber,
        amount,
        channel: "CEFTS",
        frequency,
        startDate: startDate || undefined,
        endDate: frequency !== "once" ? endDate || undefined : undefined,
      });
      setMsg("Scheduled transfer created.");
      setTo("");
      setAmount("");
      setStartDate("");
      setEndDate("");
      refresh();
    } catch (err) {
      setError(err.message || INVALID_ATTEMPT_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    try {
      await api.post(`/scheduled-transfers/${id}/cancel`, {});
      refresh();
    } catch { /* surfaced via row state on next refresh */ }
  }

  async function togglePause(s) {
    try {
      await api.post(`/scheduled-transfers/${s.id}/${s.status === "active" ? "pause" : "resume"}`, {});
      refresh();
    } catch { /* surfaced via row state on next refresh */ }
  }

  return (
    <div className="page">
      <h1>Scheduled Transfers</h1>
      <p style={{ marginBottom: 20 }}>Set up a future-dated or recurring transfer — SecureBank runs it automatically when it's due.</p>

      {account && (
        <form className="card" onSubmit={create}>
          <h3 style={{ marginBottom: 4 }}>New Schedule</h3>
          <div className="field">
            <label>From Account</label>
            <input disabled value={`${account.accountNumber} — Rs. ${account.balance.toLocaleString()}`} className="mono-input" />
          </div>
          <div className="field">
            <label>Recipient Bank</label>
            <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
              {SRI_LANKAN_BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>
          <div className="field">
            <label>To Account Number</label>
            <input value={toAccountNumber} onChange={(e) => setTo(e.target.value)} placeholder="SB-XXXX-XXXX" required className="mono-input" />
          </div>
          <div className="field">
            <label>Amount (LKR)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {Object.entries(FREQUENCY_LABELS).map(([k, label]) => (<option key={k} value={k}>{label}</option>))}
            </select>
          </div>
          <div className="field">
            <label>Start Date & Time (leave blank to run at the next opportunity)</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {frequency !== "once" && (
            <div className="field">
              <label>End Date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
            Each run is screened by the fraud detection service and carries the same Rs. 25.00 transaction fee as a manual transfer.
          </div>
          {error && <div className="error-text">{error}</div>}
          {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Saving…" : "Create Schedule"}
          </button>
        </form>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Your Schedules</h3>
        {schedules.length === 0 && <p>No scheduled transfers yet.</p>}
        {schedules.map((s) => (
          <div key={s.id} className="tx-row">
            <div>
              <div>Rs. {s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} → {s.toAccountNumber}</div>
              <div className="tx-meta">
                {FREQUENCY_LABELS[s.frequency]} · next run {new Date(s.nextRunAt.replace(" ", "T") + "Z").toLocaleString()}
                {s.lastRunStatus && ` · last run: ${s.lastRunStatus}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={"badge " + (s.status === "active" ? "badge-success" : s.status === "cancelled" ? "badge-danger" : s.status === "completed" ? "badge-neutral" : "badge-warning")}>
                {s.status}
              </span>
              {(s.status === "active" || s.status === "paused") && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => togglePause(s)}>
                    {s.status === "active" ? "Pause" : "Resume"}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => cancel(s.id)}>Cancel</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
