import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { INVALID_ATTEMPT_MESSAGE } from "../utils/friendlyError";

export default function Login() {
  const [username, setUsername] = useState("nimasha");
  const [password, setPassword] = useState("");
  // password -> biometric (has a credential) or enroll (must set one up) -> otp (fallback only)
  const [stage, setStage] = useState("password");
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [demoOtp, setDemoOtp] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  async function submitPassword(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/login", { username, password }, { auth: false });
      setPreAuthToken(res.preAuthToken);
      setHasBiometric(res.hasBiometric);
      setDemoOtp(res.demoOtp);
      // Face ID / Fingerprint is the required second factor: if this device/account already
      // has one registered, go straight there; otherwise the customer must set one up now.
      setStage(res.hasBiometric ? "biometric" : "enroll");
    } catch (err) {
      // Don't tell the person whether it was the username or the password that was
      // wrong — same "invalid attempt" message either way, like a real ATM/bank login.
      setError(INVALID_ATTEMPT_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/login/verify-otp", { preAuthToken, code }, { auth: false });
      login(res.token, res.user);
      navigate("/");
    } catch (err) {
      setError(INVALID_ATTEMPT_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function useBiometric() {
    setError(null);
    setBusy(true);
    try {
      const optRes = await fetch("/api/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }).then((r) => r.json());
      if (optRes.error) throw new Error(optRes.error);

      const assertion = await startAuthentication({ optionsJSON: optRes.options });

      const verifyRes = await fetch("/api/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: optRes.userId, response: assertion }),
      }).then((r) => r.json());
      if (verifyRes.error) throw new Error(verifyRes.error);

      login(verifyRes.token, verifyRes.user);
      navigate("/");
    } catch (err) {
      setError(err.message || "Biometric verification failed or was cancelled");
    } finally {
      setBusy(false);
    }
  }

  // Used the first time a customer logs in on a device with no registered credential yet —
  // completes FR-02a enrollment and finishes login in one step, so Face ID / Fingerprint
  // becomes the account's required second factor going forward.
  async function enrollBiometric() {
    setError(null);
    setBusy(true);
    try {
      const options = await fetch("/api/webauthn/login-enroll/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preAuthToken }),
      }).then((r) => r.json());
      if (options.error) throw new Error(options.error);

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/webauthn/login-enroll/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preAuthToken, response: attestation }),
      }).then((r) => r.json());
      if (verifyRes.error) throw new Error(verifyRes.error);

      login(verifyRes.token, verifyRes.user);
      navigate("/");
    } catch (err) {
      setError(err.message || "Biometric setup failed or was cancelled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="mark">SB</span>
          <span>SecureBank</span>
        </div>

        <div className="card">
          {stage === "password" && (
            <form onSubmit={submitPassword}>
              <h2 style={{ marginBottom: 4 }}>{t("login.title")}</h2>
              <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13 }}>
                {t("login.subtitle")}
              </p>

              <div className="field">
                <label>{t("login.username")}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
              </div>
              <div className="field">
                <label>{t("login.password")}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>

              <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
                🔒 Face ID or Fingerprint is required to finish signing in to SecureBank.
              </div>

              {error && <div className="error-text">{error}</div>}

              <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 8 }}>
                {busy ? "Checking…" : t("login.submit")}
              </button>

              <p style={{ textAlign: "center", marginTop: 18, fontSize: 12.5 }}>
                Don't have an account? <Link className="muted-link" to="/register">Open one</Link>
              </p>
              <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>
                Demo login: <span className="mono">nimasha / Password123!</span> · Admin: <span className="mono">admin / AdminPass123!</span>
              </p>
            </form>
          )}

          {stage === "biometric" && (
            <div>
              <h2 style={{ marginBottom: 4 }}>Verify it's you</h2>
              <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13 }}>
                Confirm your identity with the fingerprint or Face ID registered on this account.
              </p>

              {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

              <button type="button" className="btn btn-primary btn-block" onClick={useBiometric} disabled={busy}>
                👆 {busy ? "Waiting for verification…" : "Verify with Fingerprint / Face ID"}
              </button>

              <button
                type="button"
                className="muted-link"
                style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", fontSize: 12 }}
                onClick={() => setStage("otp")}
              >
                Trouble with biometrics? Use SMS code instead
              </button>
              <button
                type="button"
                className="muted-link"
                style={{ display: "block", margin: "8px auto 0", background: "none", border: "none" }}
                onClick={() => setStage("password")}
              >
                ← Back
              </button>
            </div>
          )}

          {stage === "enroll" && (
            <div>
              <h2 style={{ marginBottom: 4 }}>Set up Face ID / Fingerprint</h2>
              <p style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>
                SecureBank requires biometric verification to finish signing in. This device
                doesn't have one registered yet — set it up now to continue.
              </p>
              <div className="alert alert-warning" style={{ marginBottom: 16, fontSize: 12 }}>
                Your browser will prompt for your device's fingerprint, Face ID, or Windows Hello.
                Biometric data never leaves your device.
              </div>

              {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

              <button type="button" className="btn btn-primary btn-block" onClick={enrollBiometric} disabled={busy}>
                👆 {busy ? "Setting up…" : "Set Up Face ID / Fingerprint"}
              </button>

              <button
                type="button"
                className="muted-link"
                style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", fontSize: 12 }}
                onClick={() => setStage("otp")}
              >
                My device doesn't support this — use SMS code instead
              </button>
              <button
                type="button"
                className="muted-link"
                style={{ display: "block", margin: "8px auto 0", background: "none", border: "none" }}
                onClick={() => setStage("password")}
              >
                ← Back
              </button>
            </div>
          )}

          {stage === "otp" && (
            <form onSubmit={submitOtp}>
              <h2 style={{ marginBottom: 4 }}>Verify with SMS code</h2>
              <p style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>
                Fallback for devices without Face ID / Fingerprint support. We've sent a 6-digit
                code to your registered mobile number.
              </p>
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                Demo mode: SMS delivery is simulated. Your code is <b>&nbsp;{demoOtp}&nbsp;</b>
              </div>

              <div className="field">
                <label>One-Time Code</label>
                <input
                  className="mono-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                />
              </div>

              {error && <div className="error-text">{error}</div>}

              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Verifying…" : "Verify & Log In"}
              </button>

              <button
                type="button"
                className="muted-link"
                style={{ display: "block", margin: "14px auto 0", background: "none", border: "none" }}
                onClick={() => setStage(hasBiometric ? "biometric" : "enroll")}
              >
                ← Back to Face ID / Fingerprint
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
