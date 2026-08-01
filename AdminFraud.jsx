import { useEffect, useState } from "react";
import { api } from "../../api";
import FraudExplainButton from "../../components/FraudExplainButton.jsx";

export default function AdminFraud() {
  const [flagged, setFlagged] = useState([]);
  useEffect(() => { api.get("/admin/fraud-alerts").then((d) => setFlagged(d.flagged)); }, []);

  return (
    <div className="page">
      <h1>Fraud Alerts</h1>
      <p style={{ marginBottom: 20 }}>Transactions flagged by the real-time fraud screening engine (score ≥ 30).</p>
      <div className="card">
        {flagged.length === 0 && <p>No flagged transactions.</p>}
        <table>
          <thead><tr><th>Date</th><th>Customer</th><th>Account</th><th>Type</th><th>Score</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {flagged.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.full_name}</td>
                <td className="mono">{t.account_number}</td>
                <td>{t.type.replace(/_/g, " ")}</td>
                <td><span className="badge badge-warning">{t.fraud_score}</span></td>
                <td style={{ fontSize: 12.5 }}>
                  {t.fraud_reason || "—"}
                  <div style={{ marginTop: 4 }}>
                    <FraudExplainButton transactionId={t.id} />
                  </div>
                </td>
                <td><span className={"badge " + (t.status === "blocked" ? "badge-danger" : "badge-neutral")}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
