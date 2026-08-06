import { useState } from "react";

export default function Ussd() {
  const [sessionId] = useState(() => "sess-" + Math.random().toString(36).slice(2));
  const [phone, setPhone] = useState("+94771234567");
  const [screen, setScreen] = useState("Dial *123# to begin");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState("");
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  async function send(text) {
    const res = await fetch("/api/ussd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, phoneNumber: phone, text }),
    });
    const raw = await res.text();
    const isEnd = raw.startsWith("END");
    setScreen(raw.replace(/^CON |^END /, ""));
    setEnded(isEnd);
  }

  function dial() {
    setStarted(true);
    setEnded(false);
    setHistory("");
    send("");
  }

  function submit(e) {
    e.preventDefault();
    const next = history ? `${history}*${input}` : input;
    setHistory(next);
    send(next);
    setInput("");
  }

  return (
    <div className="auth-wrap">
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div className="auth-logo">
          <span className="mark">SB</span>
          <span>USSD Simulator</span>
        </div>
        <p style={{ fontSize: 12.5, textAlign: "center", marginBottom: 16 }}>
          Simulates feature-phone access (dial *123#) for customers without a smartphone — FR-11 Multi-Channel Access.
        </p>

        <div className="card" style={{ background: "#05070c", fontFamily: "var(--font-mono)" }}>
          <div className="field">
            <label>Phone number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={started} />
          </div>

          <div style={{
            background: "#0d1424", border: "1px solid var(--border)", borderRadius: 8,
            padding: 16, minHeight: 120, whiteSpace: "pre-wrap", fontSize: 13.5, marginBottom: 14,
          }}>
            {started ? screen : "Enter your registered number and dial to begin."}
          </div>

          {!started && (
            <button className="btn btn-primary btn-block" onClick={dial}>📞 Dial *123#</button>
          )}

          {started && !ended && (
            <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Reply" autoFocus />
              <button className="btn btn-primary">Send</button>
            </form>
          )}

          {ended && (
            <button className="btn btn-secondary btn-block" onClick={dial}>Dial again</button>
          )}
        </div>
      </div>
    </div>
  );
}
