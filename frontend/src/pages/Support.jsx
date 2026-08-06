import { useEffect, useState } from "react";
import { api } from "../api";

export default function Support() {
  const [disputes, setDisputes] = useState([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function refresh() { api.get("/support").then((d) => setDisputes(d.disputes)); }
  useEffect(refresh, []);

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await api.post("/support", { subject, description });
      setSubject(""); setDescription("");
      refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <h1>Support & Disputes</h1>
      <p style={{ marginBottom: 20 }}>Report an issue or dispute a transaction. Our team reviews every case.</p>

      <div className="grid-2">
        <form className="card" onSubmit={submit}>
          <h2 style={{ marginBottom: 12 }}>New request</h2>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Sending…" : "Submit"}</button>
        </form>

        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Your cases</h2>
          {disputes.length === 0 && <p>No support requests yet.</p>}
          {disputes.map((d) => (
            <div key={d.id} className="tx-row">
              <div>
                <div style={{ fontWeight: 600 }}>{d.subject}</div>
                <div className="tx-meta">{new Date(d.created_at).toLocaleString()}</div>
              </div>
              <span className={"badge " + (d.status === "resolved" ? "badge-success" : d.status === "rejected" ? "badge-danger" : "badge-warning")}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
