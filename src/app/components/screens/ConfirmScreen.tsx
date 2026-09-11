import { CheckCircle, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLastPayment } from "../../lib/selection";
import { downloadReceiptPdf } from "../../lib/receipt";
import { formatUGX } from "../../lib/export";

interface Props {
  onNavigate: (screen: string) => void;
}

export function ConfirmScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const payment = getLastPayment();

  const amount = payment?.amount ?? 0;
  const reference = payment?.reference ?? "—";
  const method = payment?.method ?? "Mobile Money";
  const status = payment?.status ?? "Pending approval";
  const when = payment ? new Date(payment.dateISO) : new Date();
  const dateStr = when.toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = when.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });

  const rows = [
    { label: "Reference", value: reference },
    { label: "Date", value: dateStr },
    { label: "Time", value: timeStr },
    { label: "Method", value: method },
    { label: "Status", value: status },
  ];

  const saveReceipt = () => {
    downloadReceiptPdf({
      reference,
      title: "Payment Request Receipt",
      status,
      amount,
      dateISO: when.toISOString(),
      rows: [
        { label: "Method", value: method },
        { label: "Type", value: "Loan Repayment" },
      ],
      footerNote:
        "This acknowledges a payment request initiated from Kuula. Final settlement is confirmed once you approve the prompt on your phone.",
    });
  };

  return (
    <div className="flex flex-col h-full bg-white items-center" style={{ paddingTop: 0 }}>
      {/* Top success band */}
      <div
        className="w-full flex flex-col items-center pt-8 pb-10"
        style={{ background: "linear-gradient(160deg, #ECFDF5 0%, #D1FAE5 100%)" }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            background: "white",
            boxShadow: "0 8px 32px rgba(16,185,129,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <CheckCircle size={56} color="#12B984" strokeWidth={1.5} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#065F46", letterSpacing: -0.5 }}>
          Payment Requested
        </h1>
        <p style={{ fontSize: 14, color: "#059669", marginTop: 4, textAlign: "center", padding: "0 24px" }}>
          Approve the prompt on your phone to complete your repayment
        </p>
      </div>

      {/* Payment amount */}
      <div className="w-full px-6 -mt-6">
        <div className="rounded-2xl p-5" style={{ background: "white", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Amount Requested</p>
          <p style={{ fontSize: 40, fontWeight: 900, color: "#1F2937", textAlign: "center", letterSpacing: -1, marginTop: 4 }}>
            {formatUGX(amount)}
          </p>

          <div style={{ borderTop: "1px dashed #E5E7EB", margin: "16px 0" }} />

          {rows.map((row) => (
            <div key={row.label} className="flex justify-between py-2">
              <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex-1 flex flex-col justify-end px-6 pb-12 gap-3 w-full">
        <button
          onClick={saveReceipt}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            boxShadow: "0 4px 16px rgba(11,107,58,0.3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Download size={18} /> Download Receipt
        </button>
        <button
          onClick={() => onNavigate("home")}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: "#F3F4F6",
            color: "#374151",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
