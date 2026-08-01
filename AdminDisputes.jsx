import { useEffect, useState } from "react";
import { api } from "../../api";

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([]);
  function refresh() { api.get("/admin/disputes").then((d) => setDisputes(d.disputes)); }
  useEffect(refresh, []);

  async function setStatus(id, status) {
    await api.post(`/admin/disputes/${id}/status`, { status });
    refresh();
  }

  return (
    <div className="page">
      <h1>Disputes</h1>
      <p style={{ marginBottom: 20 }}>Customer-reported issues and transaction disputes.</p>
      <div className="card">
        {disputes.length === 0 && <p>No disputes filed.</p>}
        {disputes.map((d) => (
          <div key={d.id} className="card" style={{ marginBottom: 10, background: "var(--surface-raised)" }}>
            <div className="flex-between">
              <div>
                <div style={{ fontWeight: 600 }}>{d.subject}</div>
                <div className="tx-meta">{d.full_name} (@{d.username}) · {new Date(d.created_at).toLocaleString()}</div>
              </div>
              <span className={"badge " + (d.status === "resolved" ? "badge-success" : d.status === "rejected" ? "badge-danger" : "badge-warning")}>
                {d.status}
              </span>
            </div>
            <p style={{ fontSize: 13, margin: "8px 0" }}>{d.description}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {["open", "investigating", "resolved", "rejected"].map((s) => (
                <button key={s} className="btn btn-sm btn-secondary" disabled={d.status === s} onClick={() => setStatus(d.id, s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
