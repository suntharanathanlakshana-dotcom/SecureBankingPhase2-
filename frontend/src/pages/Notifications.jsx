import { useEffect, useState } from "react";
import { api } from "../api";

export default function Notifications() {
  const [notes, setNotes] = useState([]);

  function refresh() { api.get("/notifications").then((d) => setNotes(d.notifications)); }
  useEffect(refresh, []);

  async function markRead(id) {
    await api.post(`/notifications/${id}/read`, {});
    refresh();
  }

  return (
    <div className="page">
      <h1>Notifications</h1>
      <p style={{ marginBottom: 20 }}>Alerts for transactions, logins, and security events.</p>

      <div className="card">
        {notes.length === 0 && <p>No notifications.</p>}
        {notes.map((n) => (
          <div key={n.id} className="tx-row" style={{ opacity: n.read ? 0.55 : 1 }}>
            <div>
              <div className="flex-between" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{n.title}</span>
                <span className={"badge " + (n.severity === "critical" ? "badge-danger" : n.severity === "warning" ? "badge-warning" : "badge-neutral")}>
                  {n.severity}
                </span>
              </div>
              <p style={{ margin: "4px 0 2px", fontSize: 13 }}>{n.body}</p>
              <div className="tx-meta">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {!n.read && <button className="btn btn-sm btn-secondary" onClick={() => markRead(n.id)}>Mark read</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
