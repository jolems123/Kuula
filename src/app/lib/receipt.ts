/**
 * Real, downloadable PDF receipts generated from actual transaction/payment
 * records. Used by transaction detail, payment confirmation, and loan screens.
 */
import { jsPDF } from "jspdf";
import { formatUGX } from "./export";

export interface ReceiptData {
  /** Reference shown as the receipt number, e.g. a transaction id or RCPT-... */
  reference: string;
  title?: string;
  status?: string;
  amount: number;
  dateISO?: string;
  /** Extra labelled rows, e.g. Type, Method, Recipient, Loan ID. */
  rows?: { label: string; value: string }[];
  footerNote?: string;
}

const BRAND = { r: 255, g: 107, b: 53 };

/** Render a single-page A5 receipt PDF and download it. */
export function downloadReceiptPdf(data: ReceiptData): void {
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 36;
  const right = pageWidth - marginX;
  let y = 40;

  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Kuula", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.title ?? "Payment Receipt", marginX, 54);

  y = 96;
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text("AMOUNT", marginX, y);
  y += 22;
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(formatUGX(data.amount), marginX, y);

  y += 28;
  doc.setDrawColor(225, 225, 225);
  doc.line(marginX, y, right, y);
  y += 22;

  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(label, marginX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(value, right, y, { align: "right" });
    y += 20;
  };

  line("Receipt No.", data.reference);
  if (data.status) line("Status", data.status);
  line("Date", new Date(data.dateISO ?? Date.now()).toLocaleString("en-GB"));
  for (const r of data.rows ?? []) line(r.label, r.value);

  y += 6;
  doc.setDrawColor(225, 225, 225);
  doc.line(marginX, y, right, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const note = data.footerNote ??
    "This is a system-generated receipt from Kuula. Keep it for your records.";
  doc.text(doc.splitTextToSize(note, right - marginX), marginX, y);

  doc.save(`kuula-receipt-${data.reference}.pdf`);
}
