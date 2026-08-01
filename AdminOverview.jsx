import { useEffect, useState } from "react";
import { api } from "../../api";

export default function AdminOverview() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/overview").then(setD); }, []);

  const cards = d ? [
    { label: "Customers", value: d.users },
    { label: "Accounts", value: d.accounts },
    { label: "Total Deposits", value: "Rs. " + d.totalBalance.toLocaleString() },
    { label: "Transactions Today", value: d.txToday },
    { label: "Blocked by Fraud Engine", value: d.blockedTx },
    { label: "Open Disputes", value: d.openDisputes },
  ] : [];

  return (
    <div className="page">
      <h1>Back-Office Overview</h1>
      <p style={{ marginBottom: 20 }}>Platform-wide health, compliance, and fraud posture.</p>

      <div className="quick-actions" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ textAlign: "left" }}>
            <div className="tx-meta">{c.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, marginTop: 6 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="alert alert-info" style={{ marginTop: 20 }}>
        This console mirrors the Phase-1 Admin & Back-Office Console (FR-10): monitor system health,
        transactions, and fraud alerts; freeze accounts; manage disputes; and generate CBSL-aligned reports.
      </div>
    </div>
  );
}
