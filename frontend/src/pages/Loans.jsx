import { useEffect, useState } from "react";
import { api } from "../api";

export default function Loans() {
  const [account, setAccount] = useState(null);
  const [loans, setLoans] = useState([]);
  const [amount, setAmount] = useState("");
  const [termMonths, setTermMonths] = useState(12);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [repayAmounts, setRepayAmounts] = useState({});
  const [msg, setMsg] = useState(null);

  function refresh() {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
    api.get("/loans").then((d) => setLoans(d.loans));
  }
  useEffect(refresh, []);

  async function apply(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await api.post("/loans/apply", { accountId: account.id, amount, termMonths, purpose });
      setAmount(""); setPurpose("");
      refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function repay(loanId) {
    const amt = repayAmounts[loanId];
    if (!amt) return;
    try {
      const res = await api.post(`/loans/${loanId}/repay`, { amount: amt });
      setRepayAmounts((r) => ({ ...r, [loanId]: "" }));
      setMsg("Repayment received — no transaction fee is charged on loan repayments.");
      setError(null);
      refresh();
    } catch (err) { setError(err.message); setMsg(null); }
  }

  return (
    <div className="page">
      <h1>Loans</h1>
      <p style={{ marginBottom: 20 }}>Apply for a loan and get an instant pre-approval decision.</p>

      <div className="grid-2">
        {account && (
          <form className="card" onSubmit={apply}>
            <h2 style={{ marginBottom: 12 }}>Apply for a loan</h2>
            <div className="field">
              <label>Amount (LKR)</label>
              <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="field">
              <label>Term (months)</label>
              <select value={termMonths} onChange={(e) => setTermMonths(e.target.value)}>
                {[6, 12, 24, 36, 60].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Purpose</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Home repair" />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Submitting…" : "Apply"}</button>
            <p style={{ fontSize: 11.5, marginTop: 10 }}>
              Pre-approval is instant for amounts within your affordability profile; larger requests go to manual review.
            </p>
          </form>
        )}

        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Your loans</h2>
          {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
          {loans.length === 0 && <p>No loans yet.</p>}
          {loans.map((l) => (
            <div key={l.id} className="card" style={{ marginBottom: 10 }}>
              <div className="flex-between">
                <div>
                  <div style={{ fontWeight: 600 }}>Rs. {l.principal.toLocaleString()}</div>
                  <div className="tx-meta">{l.purpose} · {l.termMonths}mo · {l.interestRate}% p.a.</div>
                </div>
                <span className={"badge " + (l.status === "approved" || l.status === "active" ? "badge-success" : l.status === "pending" ? "badge-warning" : "badge-neutral")}>
                  {l.status}
                </span>
              </div>
              <p style={{ fontSize: 12.5, margin: "8px 0" }}>Outstanding: <b>Rs. {l.outstanding.toLocaleString()}</b></p>
              {(l.status === "approved" || l.status === "active") && l.outstanding > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number" placeholder="Repay amount" style={{ flex: 1 }}
                    value={repayAmounts[l.id] || ""}
                    onChange={(e) => setRepayAmounts((r) => ({ ...r, [l.id]: e.target.value }))}
                  />
                  <button className="btn btn-sm btn-secondary" onClick={() => repay(l.id)}>Repay</button>
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>
                Loan repayments carry no transaction fee. Rs. 100.00 minimum balance must remain.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
