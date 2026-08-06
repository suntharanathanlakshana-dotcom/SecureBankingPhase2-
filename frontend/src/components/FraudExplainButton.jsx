import { useState } from "react";
import { api } from "../api";

// Small inline "Explain" trigger + expanding panel, shared by Statement.jsx and
// AdminFraud.jsx — fetches the AI-powered plain-language fraud explanation for one
// transaction and shows it right under the button rather than in a separate page.
export default function FraudExplainButton({ transactionId }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!explanation) {
      setBusy(true);
      try {
        const res = await api.get(`/fraud/explain/${transactionId}`);
        setExplanation(res.explanation);
      } catch {
        setExplanation("Could not load an explanation for this transaction.");
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <>
      <button type="button" className="muted-link" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={toggle}>
        {open ? "Hide" : "Explain"}
      </button>
      {open && (
        <div className="fraud-explanation">
          {busy ? "Loading explanation…" : explanation}
        </div>
      )}
    </>
  );
}
