import { useState } from "react";
import { api } from "../api";

const ATMS = [
  { id: "ATM-NUG-01", name: "Bank of Ceylon — Nugegoda" },
  { id: "ATM-COL-07", name: "SecureBank — Colombo Fort" },
  { id: "ATM-KAN-03", name: "SecureBank — Kandy City Centre" },
];

export default function AtmSimulator() {
  const [atmId, setAtmId] = useState(ATMS[0].id);
  const [digits, setDigits] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function press(d) {
    if (digits.length >= 6) return;
    setDigits(digits + d);
  }
  function clear() { setDigits(""); setError(null); setResult(null); }

  async function submit() {
    setError(null); setBusy(true);
    try {
      const res = await api.post("/cardless/redeem", { atmId, code: digits }, { auth: false });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setDigits("");
    }
  }

  return (
    <div className="auth-wrap">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="auth-logo">
          <span className="mark">SB</span>
          <span>SecureBank ATM</span>
        </div>

        <div className="atm-screen">
          <div className="field">
            <label style={{ color: "var(--text-muted)" }}>ATM Terminal</label>
            <select value={atmId} onChange={(e) => setAtmId(e.target.value)}>
              {ATMS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 18 }}>
            Cardless Withdrawal — enter the 6-digit code from your app
          </p>

          <div className="atm-code-boxes">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="atm-code-box">{digits[i] || ""}</div>
            ))}
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
          {result && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              ✓ Dispensing Rs. {result.amount.toLocaleString()}. Please collect your cash.
              <br />
              Rs. {result.feeCharged.toFixed(2)} transaction fee applied · New balance: Rs. {result.newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          )}

          <div className="atm-keypad">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <div key={d} className="atm-key" onClick={() => press(d)}>{d}</div>
            ))}
            <div className="atm-key" onClick={clear}>Clear</div>
            <div className="atm-key" onClick={() => press("0")}>0</div>
            <div className="atm-key" style={{ background: "var(--success-bg)", color: "var(--success)" }} onClick={submit}>
              {busy ? "…" : "OK"}
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: 10.5, color: "var(--text-faint)", marginTop: 16 }}>
            This code is single-use and is voided immediately after dispensing.
          </p>
        </div>
      </div>
    </div>
  );
}
