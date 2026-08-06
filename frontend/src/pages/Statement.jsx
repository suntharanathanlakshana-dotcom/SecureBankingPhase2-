import { useEffect, useState } from "react";
import { api } from "../api";
import FraudExplainButton from "../components/FraudExplainButton.jsx";

export default function Statement() {
  const [account, setAccount] = useState(null);
  const [txs, setTxs] = useState([]);

  useEffect(() => {
    api.get("/accounts").then(async (d) => {
      const acc = d.accounts[0];
      setAccount(acc);
      if (acc) {
        const s = await api.get(`/accounts/${acc.id}/statement`);
        setTxs(s.transactions);
      }
    });
  }, []);

  return (
    <div className="page">
      <h1>Statement</h1>
      <p style={{ marginBottom: 20 }}>Full transaction history for {account?.accountNumber}.</p>

      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Type</th><th>Counterparty</th><th>Channel</th><th>Status</th><th>Fraud Score</th><th style={{ textAlign: "right" }}>Amount</th></tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.createdAt).toLocaleString()}</td>
                <td>{t.type.replace(/_/g, " ")}</td>
                <td>{t.counterparty || "—"}</td>
                <td>{t.channel}</td>
                <td>
                  <span className={"badge " + (t.status === "completed" ? "badge-success" : t.status === "blocked" ? "badge-danger" : "badge-warning")}>
                    {t.status}
                  </span>
                </td>
                <td>
                  {t.fraudScore}
                  {t.fraudScore > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <FraudExplainButton transactionId={t.id} />
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "right" }} className="mono">
                  {["transfer_in", "loan_disbursement"].includes(t.type) ? "+" : "-"} Rs. {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && <p>No transactions yet.</p>}
      </div>
    </div>
  );
}
