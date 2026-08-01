import { useEffect, useState } from "react";
import { api } from "../api";
import { INVALID_ATTEMPT_MESSAGE } from "../utils/friendlyError";

export default function VirtualCard() {
  const [account, setAccount] = useState(null);
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [revealing, setRevealing] = useState(false);
  const [demoOtp, setDemoOtp] = useState(null);
  const [code, setCode] = useState("");
  const [revealed, setRevealed] = useState(null);

  const [limitInput, setLimitInput] = useState("");

  function refresh() {
    api.get("/virtual-cards").then((d) => {
      const c = d.cards[0] || null;
      setCard(c);
      if (c) setLimitInput(String(c.spendingLimit));
    }).catch(() => {});
  }

  useEffect(() => {
    api.get("/accounts").then((d) => setAccount(d.accounts[0]));
    refresh();
  }, []);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/virtual-cards/generate", { accountId: account.id });
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFreeze() {
    setBusy(true);
    try {
      await api.post(`/virtual-cards/${card.id}/${card.status === "active" ? "freeze" : "unfreeze"}`, {});
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function terminate() {
    setBusy(true);
    try {
      await api.post(`/virtual-cards/${card.id}/terminate`, {});
      setCard(null);
      setRevealed(null);
      setRevealing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post(`/virtual-cards/${card.id}/limit`, { limit: limitInput });
      setCard(res.card);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestReveal() {
    setError(null);
    setRevealed(null);
    try {
      const res = await api.post(`/virtual-cards/${card.id}/reveal/request`, {});
      setDemoOtp(res.demoOtp);
      setRevealing(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmReveal(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post(`/virtual-cards/${card.id}/reveal/confirm`, { code });
      setRevealed(res);
      setRevealing(false);
      setCode("");
    } catch {
      setError(INVALID_ATTEMPT_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow">
      <h1>Virtual Debit Card</h1>
      <p style={{ marginBottom: 20 }}>An instant, app-only card for online spending — no need to wait for a physical card.</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {!card && account && (
        <div className="card">
          <p style={{ marginBottom: 14 }}>You don't have a virtual card yet.</p>
          <button className="btn btn-primary btn-block" onClick={generate} disabled={busy}>
            {busy ? "Creating…" : "✛ Generate Virtual Card"}
          </button>
        </div>
      )}

      {card && (
        <>
          <div className={"virtual-card" + (card.status !== "active" ? " frozen" : "")}>
            <div className="virtual-card-brand">SecureBank · Virtual</div>
            <div className="virtual-card-number">
              {revealed ? revealed.cardNumber.replace(/(.{4})/g, "$1 ").trim() : card.maskedNumber}
            </div>
            <div className="virtual-card-row">
              <div>Cardholder<span>{card.cardholderName}</span></div>
              <div>Expires<span>{card.expiry}</span></div>
              <div>CVV<span>{revealed ? revealed.cvv : "•••"}</span></div>
            </div>
          </div>

          <div className="card">
            <div className="flex-between" style={{ marginBottom: 10 }}>
              <h3 style={{ marginBottom: 0 }}>Card status</h3>
              <span className={"badge " + (card.status === "active" ? "badge-success" : card.status === "frozen" ? "badge-warning" : "badge-danger")}>
                {card.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={toggleFreeze} disabled={busy}>
                {card.status === "active" ? "❄ Freeze card" : "▶ Unfreeze card"}
              </button>
              <button className="btn btn-secondary" onClick={terminate} disabled={busy}>✕ Terminate card</button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Spending limit</h3>
            <form onSubmit={saveLimit} style={{ display: "flex", gap: 10 }}>
              <input type="number" min="1" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-secondary" disabled={busy}>Save</button>
            </form>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Reveal full card details</h3>
            {!revealing && !revealed && (
              <button className="btn btn-secondary" onClick={requestReveal}>👁 Reveal number & CVV</button>
            )}
            {revealing && (
              <form onSubmit={confirmReveal}>
                <div className="otp-display">
                  <div className="otp-caption">Demo mode — your OTP</div>
                  <div className="otp-digits">{demoOtp}</div>
                </div>
                <div className="field">
                  <label>Enter One-Time Code</label>
                  <input className="mono-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
                </div>
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Verifying…" : "Confirm"}</button>
              </form>
            )}
            {revealed && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Details shown above — they won't be shown again without re-verifying.</p>}
          </div>
        </>
      )}
    </div>
  );
}
