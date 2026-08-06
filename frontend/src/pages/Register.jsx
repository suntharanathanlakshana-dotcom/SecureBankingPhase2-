import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Register() {
  const [form, setForm] = useState({ fullName: "", username: "", email: "", phone: "", nic: "", password: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/register", form, { auth: false });
      setSuccess(`Account created — number ${res.accountNumber}. You can log in now — you'll be asked to set up Face ID / Fingerprint on first login.`);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err.message);
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
          <form onSubmit={submit}>
            <h2 style={{ marginBottom: 4 }}>Open an account</h2>
            <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13 }}>
              Re-establish secure access to Sri Lanka's rebuilt digital banking platform.
            </p>

            <div className="field">
              <label>Full name</label>
              <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Username</label>
                <input value={form.username} onChange={(e) => set("username", e.target.value)} required />
              </div>
              <div className="field">
                <label>NIC number</label>
                <input value={form.nic} onChange={(e) => set("nic", e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </div>
            <div className="field">
              <label>Mobile number</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+94 7X XXX XXXX" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required />
            </div>

            {error && <div className="error-text">{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 12.5 }}>
              Already have an account? <Link className="muted-link" to="/login">Log in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
