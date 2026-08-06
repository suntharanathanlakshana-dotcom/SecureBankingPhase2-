import { useEffect, useState } from "react";
import { api } from "../../api";

export default function AdminReports() {
  const [summary, setSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [form, setForm] = useState({ category: "fraud", severity: "medium", description: "" });

  function refresh() {
    api.get("/reports/transaction-summary").then(setSummary);
    api.get("/reports/incidents").then((d) => setIncidents(d.incidents));
  }
  useEffect(refresh, []);

  async function fileIncident(e) {
    e.preventDefault();
    await api.post("/reports/incidents", form);
    setForm({ category: "fraud", severity: "medium", description: "" });
    refresh();
  }

  return (
    <div className="page">
      <h1>Regulatory Reports</h1>
      <p style={{ marginBottom: 20 }}>
        CBSL-aligned transaction summaries and IT/cybersecurity incident reporting (per Circular No. 2 of 2025).
      </p>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Transaction Summary</h2>
          <table>
            <thead><tr><th>Type</th><th>Channel</th><th>Status</th><th>Count</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {summary?.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.type.replace(/_/g, " ")}</td><td>{r.channel}</td><td>{r.status}</td>
                  <td>{r.count}</td><td style={{ textAlign: "right" }} className="mono">Rs. {r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} href="/api/reports/audit-export.csv" target="_blank" rel="noreferrer">
            ⬇ Export audit trail (CSV)
          </a>
        </div>

        <div>
          <form className="card" onSubmit={fileIncident}>
            <h2 style={{ marginBottom: 12 }}>File an Incident Report</h2>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="fraud">Fraud</option>
                <option value="outage">Outage</option>
                <option value="data_integrity">Data Integrity</option>
              </select>
            </div>
            <div className="field">
              <label>Severity</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
            </div>
            <button className="btn btn-primary btn-block">File report</button>
          </form>

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Recent Incidents</h2>
            {incidents.length === 0 && <p>No incidents logged.</p>}
            {incidents.map((i) => (
              <div key={i.id} className="tx-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{i.category} · {i.severity}</div>
                  <div className="tx-meta">{i.description}</div>
                </div>
                <span className="badge badge-neutral">{i.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
