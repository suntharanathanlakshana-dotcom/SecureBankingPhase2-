import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api";

export default function Profile() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.accounts || [])).catch((e) => setError(e.message));
  }, []);

  const initials = (user?.fullName || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="page-narrow">
      <h1>Profile</h1>
      <p style={{ marginBottom: 20 }}>Your account holder details as held by SecureBank.</p>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div
          className="profile-avatar"
          style={{ width: 52, height: 52, fontSize: 18 }}
        >
          {initials}
        </div>
        <div>
          <h2 style={{ marginBottom: 2 }}>{user?.fullName}</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
            @{user?.username} · {user?.role === "admin" ? "Administrator" : "Customer"}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <h3 style={{ marginBottom: 14 }}>Contact details</h3>
        <div className="tx-row">
          <div>Email</div>
          <div className="mono">{user?.email}</div>
        </div>
        <div className="tx-row">
          <div>Phone</div>
          <div className="mono">{user?.phone || "—"}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 14 }}>Accounts</h3>
        {accounts.length === 0 && <p>No linked accounts found.</p>}
        {accounts.map((a) => (
          <div className="tx-row" key={a.id}>
            <div>{a.accountNumber}</div>
            <div className="mono">
              Rs. {a.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <Link to="/settings" className="btn btn-secondary">⚙ Settings</Link>
        <Link to="/security" className="btn btn-secondary">◆ Security</Link>
      </div>
    </div>
  );
}
