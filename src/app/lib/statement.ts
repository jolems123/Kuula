import { jsPDF } from "jspdf";
import { formatUGX } from "./export";

export interface StatementTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  loan_disbursement: "Loan disbursement",
  loan_disbursement_leg: "Loan disbursement",
  loan_payment: "Loan repayment",
  wallet_topup: "Wallet top-up",
};

function isCredit(type: string): boolean {
  return type === "loan_disbursement" || type === "loan_disbursement_leg" || type === "wallet_topup";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Download a customer transaction statement generated only from authoritative
 * Node API transaction rows. It deliberately includes transaction status so a
 * pending or failed provider operation cannot be mistaken for settled money.
 */
export function downloadTransactionStatement(transactions: StatementTransaction[], generatedAt = new Date()): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const right = pageWidth - margin;
  let y = 42;

  const header = () => {
    doc.setFillColor(255, 107, 53);
    doc.rect(0, 0, pageWidth, 62, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Kuula", margin, 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Customer Transaction Statement", margin, 52);
    y = 88;
  };

  const ensureSpace = (height = 22) => {
    if (y + height <= pageHeight - 48) return;
    doc.addPage();
    header();
  };

  header();
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedAt.toLocaleString("en-GB")}`, margin, y);
  y += 16;
  doc.text("Amounts are in UGX. Only transactions marked Completed represent settled money movement.", margin, y);
  y += 24;

  const completed = transactions.filter((txn) => txn.status.toLowerCase() === "completed");
  const credits = completed.filter((txn) => isCredit(txn.type)).reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
  const debits = completed.filter((txn) => !isCredit(txn.type)).reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text(`Settled credits: ${formatUGX(credits)}`, margin, y);
  doc.text(`Settled repayments/debits: ${formatUGX(debits)}`, right, y, { align: "right" });
  y += 22;
  doc.setDrawColor(225, 225, 225);
  doc.line(margin, y, right, y);
  y += 18;

  if (transactions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text("No transactions are available for this statement period.", margin, y);
  }

  for (const txn of transactions) {
    ensureSpace(58);
    const when = txn.createdAt ? new Date(txn.createdAt) : null;
    const date = when && !Number.isNaN(when.getTime()) ? when.toLocaleString("en-GB") : "Unknown date";
    const label = TYPE_LABEL[txn.type] ?? txn.type;
    const direction = isCredit(txn.type) ? "+" : "-";

    doc.setFont("helvetica", "bold");
    doc.setTextColor(45, 45, 45);
    doc.setFontSize(10);
    doc.text(label, margin, y);
    doc.text(`${direction}${formatUGX(Math.abs(txn.amount))}`, right, y, { align: "right" });
    y += 15;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(105, 105, 105);
    doc.setFontSize(8.5);
    doc.text(`${date} · ${txn.status}`, margin, y);
    y += 13;
    const reference = txn.reference || txn.id;
    doc.text(`Reference: ${reference}`, margin, y);
    y += 13;
    doc.text(`Transaction ID: ${txn.id}`, margin, y);
    y += 15;
    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y, right, y);
    y += 14;
  }

  ensureSpace(40);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(125, 125, 125);
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(
      "This statement is generated from Kuula's recorded transaction ledger. Pending and failed entries are shown for transparency but are not counted as settled money movement.",
      right - margin,
    ),
    margin,
    y,
  );

  const datePart = generatedAt.toISOString().slice(0, 10);
  doc.save(`kuula-statement-${safeFilePart(datePart)}.pdf`);
}
