import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";

const quickActions = [
  { to: "/transfer", icon: "⇄", label: "Transfer" },
  { to: "/bills", icon: "▤", label: "Pay Bills" },
  { to: "/cardless", icon: "▣", label: "ATM Code" },
  { to: "/loans", icon: "◎", label: "Loans" },
];

export default function Dashboard() {
  const [account, setAccount] = useState(null);
  const [txs, setTxs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    api.get("/accounts").then(async (d) => {
      const acc = d.accounts[0];
      setAccount(acc);
      if (acc) {
        const s = await api.get(`/accounts/${acc.id}/statement`);
        setTxs(s.transactions.slice(0, 6));
        setAlerts(s.transactions.filter((t) => t.fraudScore >= 30 || t.status === "blocked"));
      }
    }).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <h1>{t("dashboard.title")}</h1>
      <p style={{ marginBottom: 20 }}>{t("dashboard.subtitle")}</p>

      {error && <div className="alert alert-danger">{error}</div>}

      {account && (
        <div className="balance-card">
          <div className="balance-label">{t("dashboard.totalBalance")}</div>
          <div className="balance-amount">Rs. {account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="balance-sub">{account.accountType.toUpperCase()} · {account.accountNumber} {account.cardFrozen && "· CARD FROZEN"}</div>
        </div>
      )}

      <div className="quick-actions">
        {quickActions.map((a) => (
          <Link key={a.to} to={a.to} className="quick-action">
            <span className="quick-action-icon">{a.icon}</span>
            <span>{a.label}</span>
          </Link>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          ⚠ {alerts.length} transaction{alerts.length > 1 ? "s" : ""} flagged by fraud screening. Review your statement.
        </div>
      )}

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 6 }}>
          <h3 style={{ marginBottom: 0 }}>{t("dashboard.recentTransactions")}</h3>
          <Link className="muted-link" to="/statement">{t("dashboard.seeAll")}</Link>
        </div>
        {txs.length === 0 && <p>No recent activity yet.</p>}
        {txs.map((t) => (
          <div key={t.id} className="tx-row">
            <div>
              <div>{labelFor(t)}</div>
              <div className="tx-meta">{new Date(t.createdAt).toLocaleString()} · {t.channel}</div>
            </div>
            <div className={"tx-amount " + (t.type === "transfer_in" || t.type === "loan_disbursement" ? "positive" : "negative")}>
              {t.type === "transfer_in" || t.type === "loan_disbursement" ? "+" : "-"} Rs. {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
          A minimum balance of Rs. 100.00 must always remain in the account, and a flat Rs. 25.00 service fee applies to every outgoing transaction.
        </div>
      </div>
    </div>
  );
}

function labelFor(t) {
  const map = {
    transfer_out: "Transfer to " + t.counterparty,
    transfer_in: t.counterparty,
    bill_payment: t.counterparty,
    qr_payment: "QR payment — " + t.counterparty,
    atm_withdrawal: "Cardless ATM withdrawal",
    loan_disbursement: "Loan disbursed",
    loan_repayment: "Loan repayment",
    transaction_fee: "Transaction fee",
  };
  return map[t.type] || t.type;
}
