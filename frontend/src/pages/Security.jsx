import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "../api";

export default function Security() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  function refresh() { api.get("/webauthn/status").then(setStatus).catch(() => {}); }
  useEffect(refresh, []);
  useEffect(() => { api.get("/auth/login-history").then((d) => setHistory(d.history)).catch(() => {}); }, []);

  async function enroll() {
    setError(null); setMsg(null); setBusy(true);
    try {
      const options = await api.post("/webauthn/register/options", {});
      const attestation = await startRegistration({ optionsJSON: options });
      await api.post("/webauthn/register/verify", attestation);
      setMsg("Biometric login enabled on this device.");
      refresh();
    } catch (err) {
      setError(err.message || "Could not register biometric credential on this device/browser");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow">
      <h1>Security</h1>
      <p style={{ marginBottom: 20 }}>Manage how you verify your identity when logging in or approving sensitive actions.</p>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <h2 style={{ marginBottom: 0 }}>Fingerprint / Face ID</h2>
          {status?.registered ? (
            <span className="badge badge-success">Enabled</span>
          ) : (
            <span className="badge badge-neutral">Not set up</span>
          )}
        </div>
        <p style={{ fontSize: 13 }}>
          Uses your device's built-in biometric sensor (Windows Hello, Touch ID, Face ID, or Android
          fingerprint/face unlock) via the WebAuthn standard. Your fingerprint or face data never
          leaves this device — SecureBank only ever receives a cryptographic signature.
        </p>

        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        {msg && <div className="alert alert-success" style={{ marginBottom: 10 }}>{msg}</div>}

        <button className="btn btn-primary" onClick={enroll} disabled={busy}>
          {busy ? "Waiting for device…" : status?.registered ? "Add another device" : "👆 Set up biometric login"}
        </button>

        {status?.credentials?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3>Registered credentials</h3>
            {status.credentials.map((c) => (
              <div key={c.id} className="tx-row">
                <div>{c.label}</div>
                <div className="tx-meta">{new Date(c.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        <div className="alert alert-info" style={{ marginTop: 16 }}>
          Note: this requires a device with a fingerprint sensor, Face ID, or Windows Hello, accessed
          over localhost or HTTPS. It won't work in every sandboxed preview environment — the OTP
          method above always works as a fallback, exactly as designed in the Phase 1 blueprint.
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Login History</h2>
        {history.length === 0 && <p style={{ fontSize: 13 }}>No login activity recorded yet.</p>}
        {history.map((h) => (
          <div key={h.id} className="tx-row">
            <div>
              <div>{h.result === "success" ? "Successful login" : "Failed login attempt"}{h.factor ? ` · ${h.factor.replace(/_/g, " ")}` : ""}</div>
              <div className="tx-meta">{new Date(h.createdAt.replace(" ", "T") + "Z").toLocaleString()} {h.ip ? `· ${h.ip}` : ""}</div>
            </div>
            <span className={"badge " + (h.result === "success" ? "badge-success" : "badge-danger")}>{h.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
