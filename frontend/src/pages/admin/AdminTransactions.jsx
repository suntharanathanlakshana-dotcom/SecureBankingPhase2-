import { useEffect, useState } from "react";
import { api } from "../../api";

export default function AdminTransactions() {
  const [txs, setTxs] = useState([]);
  useEffect(() => { api.get("/admin/transactions").then((d) => setTxs(d.transactions)); }, []);

  return (
    <div className="page">
      <h1>All Transactions</h1>
      <p style={{ marginBottom: 20 }}>Platform-wide transaction ledger across every account.</p>
      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>Customer</th><th>Account</th><th>Type</th><th>Channel</th><th>Status</th><th>Fraud</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.full_name}</td>
                <td className="mono">{t.account_number}</td>
                <td>{t.type.replace(/_/g, " ")}</td>
                <td>{t.channel}</td>
                <td><span className={"badge " + (t.status === "completed" ? "badge-success" : t.status === "blocked" ? "badge-danger" : "badge-warning")}>{t.status}</span></td>
                <td>{t.fraud_score}</td>
                <td style={{ textAlign: "right" }} className="mono">Rs. {(t.amount_cents / 100).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
