import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { api } from "../api";

export default function Cardless() {
  const [account, setAccount] = useState(null);
  const [atms, setAtms] = useState([]);
  const [atmId, setAtmId] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
    api.get("/cardless/atms").then((d) => { setAtms(d.atms); setAtmId(d.atms[0]?.id || ""); });
  }, []);

  async function confirmBiometric() {
    setError(null);
    try {
      const me = await api.get("/auth/me");
      const optRes = await fetch("/api/webauthn/login/options", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: me.user.username }),
      }).then((r) => r.json());
      if (optRes.error) throw new Error(optRes.error);
      await startAuthentication({ optionsJSON: optRes.options });
      setConfirmed("biometric");
    } catch (err) {
      setError(err.message || "Biometric confirmation failed");
    }
  }

  function confirmPin(e) {
    e.preventDefault();
    if (pin.length < 4) { setError("Enter at least a 4-digit PIN"); return; }
    setConfirmed("pin");
    setError(null);
  }

  async function generateCode(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const res = await api.post("/cardless/request", {
        accountId: account.id, amount, atmId, confirmedWith: confirmed,
      });
      setResult(res);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="page-narrow">
      <h1>Cardless ATM Withdrawal</h1>
      <p style={{ marginBottom: 20 }}>No card needed — confirm your identity and get a one-time code to use at any SecureBank ATM.</p>

      {account && !result && (
        <form className="card" onSubmit={generateCode}>
          <div className="field">
            <label>From Account</label>
            <input disabled value={`${account.accountNumber} — Rs. ${account.balance.toLocaleString()}`} className="mono-input" />
          </div>
          <div className="field">
            <label>Withdrawal Amount (LKR)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Choose Nearby ATM</label>
            <select value={atmId} onChange={(e) => setAtmId(e.target.value)}>
              {atms.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.distanceKm} km)</option>)}
            </select>
          </div>

          {!confirmed ? (
            <div className="card" style={{ background: "var(--surface-raised)", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Confirm identity to generate code</div>
              <div className="biometric-row">
                <button type="button" className="biometric-btn" onClick={confirmBiometric}>
                  <span className="icon">👆</span> Fingerprint / Face ID
                </button>
              </div>
              <div className="divider-row">or use app PIN</div>
              <form onSubmit={confirmPin} style={{ display: "flex", gap: 8 }}>
                <input placeholder="App PIN" className="mono-input" value={pin} onChange={(e) => setPin(e.target.value)} />
                <button className="btn btn-secondary btn-sm">Confirm</button>
              </form>
            </div>
          ) : (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              ✓ Identity confirmed via {confirmed === "biometric" ? "biometric" : "app PIN"}
            </div>
          )}

          <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12 }}>
            A Rs. 25.00 transaction fee applies when you withdraw at the ATM. Rs. 100.00 minimum balance must remain.
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || !confirmed}>
            {busy ? "Generating…" : "Generate Withdrawal Code"}
          </button>
        </form>
      )}

      {result && (
        <div className="card">
          <div className="otp-display">
            <div className="otp-caption">Your one-time withdrawal code</div>
            <div className="otp-digits">{result.code}</div>
            <div className="otp-caption" style={{ marginTop: 10 }}>Expires {new Date(result.expiresAt).toLocaleTimeString()} · single use only</div>
          </div>
          <p style={{ fontSize: 13 }}>No card needed — enter this code at <b>{result.atm.name}</b>.</p>
          <a className="btn btn-secondary btn-block" href="/atm" target="_blank" rel="noreferrer">Open ATM Simulator →</a>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={() => { setResult(null); setConfirmed(null); setAmount(""); }}>
            Request another code
          </button>
        </div>
      )}
    </div>
  );
}
