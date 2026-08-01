import { useEffect, useState } from "react";
import { api } from "../api";

export default function Bills() {
  const [account, setAccount] = useState(null);
  const [billers, setBillers] = useState([]);
  const [tab, setTab] = useState("bill");
  const [billerCode, setBillerCode] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [merchantQr, setMerchantQr] = useState("Grocery Mart — Colombo 05");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
    api.get("/bills/billers").then((d) => setBillers(d.billers));
  }, []);

  async function payBill(e) {
    e.preventDefault();
    setError(null); setMsg(null); setBusy(true);
    try {
      const res = await api.post("/bills/pay", { accountId: account.id, billerCode, referenceNo, amount });
      setAccount(res.account);
      setMsg(`Bill paid successfully (Rs. ${res.feeCharged.toFixed(2)} fee applied). New balance: Rs. ${res.account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      setAmount(""); setReferenceNo("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function payQr(e) {
    e.preventDefault();
    setError(null); setMsg(null); setBusy(true);
    try {
      const res = await api.post("/bills/qr-pay", { accountId: account.id, merchantQr, amount });
      setAccount(res.account);
      setMsg(`Payment sent to merchant (Rs. ${res.feeCharged.toFixed(2)} fee applied). New balance: Rs. ${res.account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      setAmount("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="page-narrow">
      <h1>Bills & QR Pay</h1>
      <p style={{ marginBottom: 16 }}>Pay utility bills or scan a LankaQR merchant code.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={"btn btn-sm " + (tab === "bill" ? "btn-primary" : "btn-secondary")} onClick={() => setTab("bill")}>Bill Payment</button>
        <button className={"btn btn-sm " + (tab === "qr" ? "btn-primary" : "btn-secondary")} onClick={() => setTab("qr")}>LankaQR Pay</button>
      </div>

      {account && tab === "bill" && (
        <form className="card" onSubmit={payBill}>
          <div className="field">
            <label>From Account</label>
            <input disabled value={`${account.accountNumber} — Rs. ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} className="mono-input" />
          </div>
          <div className="field">
            <label>Biller</label>
            <select value={billerCode} onChange={(e) => setBillerCode(e.target.value)} required>
              <option value="">Select a biller</option>
              {billers.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Reference / Account No.</label>
            <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} required />
          </div>
          <div className="field">
            <label>Amount (LKR)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12 }}>
            A Rs. 25.00 transaction fee applies. Rs. 100.00 minimum balance must remain.
          </div>
          {error && <div className="error-text">{error}</div>}
          {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Paying…" : "Pay Bill"}</button>
        </form>
      )}

      {account && tab === "qr" && (
        <form className="card" onSubmit={payQr}>
          <div className="field">
            <label>From Account</label>
            <input disabled value={`${account.accountNumber} — Rs. ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} className="mono-input" />
          </div>
          <div className="alert alert-info" style={{ marginBottom: 14 }}>📷 Simulated QR scan — merchant detected below.</div>
          <div className="field">
            <label>Merchant</label>
            <input value={merchantQr} onChange={(e) => setMerchantQr(e.target.value)} required />
          </div>
          <div className="field">
            <label>Amount (LKR)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12 }}>
            A Rs. 25.00 transaction fee applies. Rs. 100.00 minimum balance must remain.
          </div>
          {error && <div className="error-text">{error}</div>}
          {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Paying…" : "Pay Merchant"}</button>
        </form>
      )}
    </div>
  );
}
