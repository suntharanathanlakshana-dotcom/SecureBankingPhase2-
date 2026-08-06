import { useEffect, useState } from "react";
import { api } from "../api";
import { SRI_LANKAN_BANKS } from "../constants/sriLankanBanks";
import { downloadTransferReceipt } from "../utils/receipt";
import { INVALID_ATTEMPT_MESSAGE } from "../utils/friendlyError";

export default function Transfer() {
  const [account, setAccount] = useState(null);
  const [step, setStep] = useState(1);
  const [bankName, setBankName] = useState(SRI_LANKAN_BANKS[0]);
  const [toAccountNumber, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("CEFTS");
  const [demoOtp, setDemoOtp] = useState(null);
  const [fraudNote, setFraudNote] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
  }, []);

  async function initiate(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/transfers/initiate", {
        fromAccountId: account.id, toAccountNumber, amount, channel,
      });
      setDemoOtp(res.demoOtp);
      setFraudNote(res.fraudPreCheck);
      setStep(2);
    } catch (err) {
      // Form-validation errors (bad amount, insufficient balance, missing recipient) stay
      // specific here — the person typed something and needs to know what to fix.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/transfers/confirm", {
        fromAccountId: account.id, toAccountNumber, amount, channel, code,
      });
      setResult(res);
      setCompletedAt(new Date());
      setStep(3);
    } catch (err) {
      // OTP / fraud-block failures are security-sensitive — don't echo the server's
      // specific reason back to the screen, just prompt a retry.
      setError(INVALID_ATTEMPT_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  function downloadReceipt() {
    downloadTransferReceipt({
      transactionId: result.transactionId,
      fromAccountNumber: account.accountNumber,
      toAccountNumber,
      bankName,
      amount,
      channel,
      newBalance: result.account.balance,
      feeCharged: result.feeCharged,
      timestamp: completedAt || new Date(),
    });
  }

  return (
    <div className="page-narrow">
      <h1>Transfer Money</h1>
      <p style={{ marginBottom: 20 }}>Interbank and intrabank transfers via CEFTS / SLIPS.</p>

      <div className="step-indicator">
        <div className={"step-dot " + (step >= 1 ? "active" : "")}>1</div>
        <div className="step-line" />
        <div className={"step-dot " + (step >= 2 ? "active" : "")}>2</div>
        <div className="step-line" />
        <div className={"step-dot " + (step >= 3 ? "active" : "")}>3</div>
      </div>

      {step === 1 && account && (
        <form className="card" onSubmit={initiate}>
          <div className="field">
            <label>From Account</label>
            <input disabled value={`${account.accountNumber} — Rs. ${account.balance.toLocaleString()}`} className="mono-input" />
          </div>
          <div className="field">
            <label>Recipient Bank</label>
            <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
              {SRI_LANKAN_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>To Account Number</label>
            <input value={toAccountNumber} onChange={(e) => setTo(e.target.value)} placeholder="SB-XXXX-XXXX" required className="mono-input" />
          </div>
          <div className="field">
            <label>Amount (LKR)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Transfer Method</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="CEFTS">Instant (CEFTS)</option>
              <option value="SLIPS">Standard (SLIPS)</option>
            </select>
          </div>
          {bankName !== SRI_LANKAN_BANKS[0] && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              🏦 Interbank transfer to {bankName} — routed over the shared CEFTS/SLIPS network like a real Sri Lankan bank transfer.
            </div>
          )}
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            🛡 This transfer will be screened by the real-time fraud detection service.
          </div>
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
            A Rs. 25.00 transaction fee applies. Rs. 100.00 minimum balance must remain in your account.
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Checking…" : "Continue → Verify with OTP"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form className="card" onSubmit={confirm}>
          <h2 style={{ marginBottom: 4 }}>Verify Transfer</h2>
          <p style={{ marginTop: 0, fontSize: 13 }}>
            Rs. {Number(amount).toLocaleString()} to {toAccountNumber} ({bankName})
          </p>
          {fraudNote && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              Fraud pre-check score: {fraudNote.score}/100 {fraudNote.note ? `(${fraudNote.note})` : "— looks normal"}
            </div>
          )}
          <div className="otp-display">
            <div className="otp-caption">Demo mode — your OTP</div>
            <div className="otp-digits">{demoOtp}</div>
          </div>
          <div className="field">
            <label>Enter One-Time Code</label>
            <input className="mono-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Confirming…" : "Confirm Transfer"}
          </button>
          <button type="button" className="muted-link" style={{ display: "block", margin: "12px auto 0", background: "none", border: "none" }} onClick={() => setStep(1)}>← Edit details</button>
        </form>
      )}

      {step === 3 && result && (
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 14 }}>
            ✓ Transfer completed successfully
          </div>
          <p>Rs. {Number(amount).toLocaleString()} sent to {toAccountNumber} ({bankName}).</p>
          <p style={{ fontSize: 12 }}>Reference: <span className="mono">{result.transactionId}</span></p>
          <p style={{ fontSize: 12 }}>Transaction fee charged: Rs. {result.feeCharged.toFixed(2)}</p>
          <p style={{ fontSize: 13 }}>New balance: <b>Rs. {result.account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={downloadReceipt}>
              ⬇ Download Receipt (PDF)
            </button>
            <button className="btn btn-secondary" onClick={() => { setStep(1); setResult(null); setTo(""); setAmount(""); setAccount(result.account); }}>
              Make another transfer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
