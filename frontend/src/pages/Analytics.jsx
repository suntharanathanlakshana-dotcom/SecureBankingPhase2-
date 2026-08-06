import { useEffect, useState } from "react";
import { api } from "../api";

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/analytics/spending?months=6").then(setData).catch((e) => setError(e.message));
  }, []);

  const maxMonthly = data ? Math.max(1, ...data.months.map((m) => Math.max(m.spent, m.income))) : 1;

  return (
    <div className="page">
      <h1>Spending Analytics</h1>
      <p style={{ marginBottom: 20 }}>How your money has moved over the last 6 months.</p>

      {error && <div className="alert alert-danger">{error}</div>}

      {data && (
        <>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="balance-label">Total Spent (6 months)</div>
              <div className="balance-amount" style={{ fontSize: 24 }}>
                Rs. {data.totals.spent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="card">
              <div className="balance-label">Total Income (6 months)</div>
              <div className="balance-amount" style={{ fontSize: 24, color: "var(--success)" }}>
                Rs. {data.totals.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Monthly Spend vs Income</h3>
            {data.months.length === 0 && <p>No transaction activity yet.</p>}
            {data.months.length > 0 && (
              <>
                <div className="bar-chart">
                  {data.months.map((m) => (
                    <div key={m.month} className="bar-chart-col">
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: "100%" }}>
                        <div className="bar-chart-bar" style={{ height: `${Math.max(3, (m.spent / maxMonthly) * 140)}px` }} title={`Spent Rs. ${m.spent.toFixed(2)}`} />
                        <div className="bar-chart-bar income" style={{ height: `${Math.max(3, (m.income / maxMonthly) * 140)}px` }} title={`Income Rs. ${m.income.toFixed(2)}`} />
                      </div>
                      <div className="bar-chart-label">{m.month.slice(5)}/{m.month.slice(2, 4)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--primary)", marginRight: 6 }} />Spent</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--success)", marginRight: 6 }} />Income</span>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Spending by Category</h3>
            {data.categories.length === 0 && <p>No outgoing transactions in this period.</p>}
            {data.categories.map((c) => (
              <div key={c.type} className="category-bar-row">
                <div className="flex-between">
                  <span>{c.label}</span>
                  <span className="mono">Rs. {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({c.percent}%)</span>
                </div>
                <div className="category-bar-track">
                  <div className="category-bar-fill" style={{ width: `${c.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
