import { jsPDF } from "jspdf";

// Generates and triggers a download of a one-page PDF transaction transcript/receipt
// for a completed transfer. Kept dependency-light (no html2canvas) — built directly
// with jsPDF primitives so it works the same in light or dark mode UI.
export function downloadTransferReceipt({
  transactionId,
  fromAccountNumber,
  toAccountNumber,
  bankName,
  amount,
  channel,
  newBalance,
  feeCharged,
  timestamp = new Date(),
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;

  // Header
  doc.setFillColor(13, 71, 161); // #0D47A1
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SecureBank", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Transaction Transcript / Receipt", marginX, 56);

  y = 96;
  doc.setTextColor(20, 26, 43);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Transfer completed", marginX, y);
  y += 8;
  doc.setDrawColor(215, 222, 234);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 28;

  const rows = [
    ["Transaction ID", transactionId],
    ["Date & Time", timestamp.toLocaleString()],
    ["From Account", fromAccountNumber],
    ["To Bank", bankName],
    ["To Account", toAccountNumber],
    ["Amount", `Rs. ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ["Channel", channel === "CEFTS" ? "Instant (CEFTS)" : "Standard (SLIPS)"],
    ["Status", "Completed"],
    ...(feeCharged != null ? [["Transaction Fee", `Rs. ${Number(feeCharged).toLocaleString(undefined, { minimumFractionDigits: 2 })}`]] : []),
    ["New Balance", `Rs. ${Number(newBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setTextColor(90, 100, 120);
    doc.text(label, marginX, y);
    doc.setTextColor(20, 26, 43);
    doc.setFont("helvetica", "bold");
    doc.text(String(value), marginX + 160, y);
    doc.setFont("helvetica", "normal");
    y += 24;
  });

  y += 16;
  doc.setDrawColor(215, 222, 234);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 20;
  doc.setFontSize(9);
  doc.setTextColor(140, 148, 166);
  doc.text(
    "This is a system-generated transcript from SecureBank's Rebuilt Digital Banking Platform.",
    marginX,
    y
  );
  y += 14;
  doc.text("No signature required. Retain for your records.", marginX, y);

  doc.save(`SecureBank_Receipt_${transactionId}.pdf`);
}
