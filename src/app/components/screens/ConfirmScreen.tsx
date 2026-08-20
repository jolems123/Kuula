import { CheckCircle, Clock3, AlertTriangle, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { getLastPayment } from "../../lib/selection";
import { downloadReceiptPdf } from "../../lib/receipt";
import { formatUGX } from "../../lib/export";

interface Props {
  onNavigate: (screen: string) => void;
}

type ProviderState = "pending" | "settled" | "failed";

export function ConfirmScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const payment = getLastPayment();
  const [providerState, setProviderState] = useState<ProviderState>("pending");
  const [providerStatus, setProviderStatus] = useState("Waiting for provider confirmation");

  const amount = payment?.amount ?? 0;
  const reference = payment?.reference ?? "—";
  const method = payment?.method ?? "Verified Mobile Money";
  const when = payment ? new Date(payment.dateISO) : new Date();
  const dateStr = when.toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = when.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (!token || !payment?.reference || payment.reference === "—") return;
    let active = true;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const { transactions } = await api.getTransactions(token);
        const transaction = transactions.find((item) => String(item.reference ?? "") === payment.reference);
        if (!active || !transaction) return;
        const status = String(transaction.status ?? "pending").toLowerCase();
        const statusLabel = String(transaction.providerStatus ?? status).replace(/_/g, " ");
        if (["completed", "settled", "paid", "success", "successful"].includes(status)) {
          setProviderState("settled");
          setProviderStatus("Provider-confirmed settlement");
          if (timer) window.clearInterval(timer);
        } else if (["failed", "declined", "cancelled", "canceled"].includes(status)) {
          setProviderState("failed");
          setProviderStatus(statusLabel || "Payment provider declined the collection");
          if (timer) window.clearInterval(timer);
        } else {
          setProviderState("pending");
          setProviderStatus(statusLabel || "Waiting for provider confirmation");
        }
      } catch {
        // Keep the last known state; the transaction endpoint can be retried on the next poll.
      }
    };

    void refresh();
    timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [token, payment?.reference]);

  const visual = useMemo(() => {
    if (providerState === "settled") return {
      Icon: CheckCircle,
      title: "Repayment Confirmed",
      subtitle: "Kuula has received provider confirmation and updated the financial transaction.",
      icon: "#0B5E3A",
      bg: "#EEF7F2",
      text: "#064A2E",
    };
    if (providerState === "failed") return {
      Icon: AlertTriangle,
      title: "Repayment Not Completed",
      subtitle: "The collection did not settle. Your repayment balance is not reduced by this request.",
      icon: "#B42318",
      bg: "#FEF3F2",
      text: "#991B1B",
    };
    return {
      Icon: Clock3,
      title: "Repayment Pending",
      subtitle: "Approve the Mobile Money prompt if it is still open. Kuula will mark the repayment settled only after provider confirmation.",
      icon: "#9A6A00",
      bg: "#FFF9E5",
      text: "#725000",
    };
  }, [providerState]);

  const rows = [
    { label: "Reference", value: reference },
    { label: "Requested", value: `${dateStr} · ${timeStr}` },
    { label: "Method", value: method },
    { label: "Provider state", value: providerStatus },
  ];

  const saveRecord = () => {
    const settled = providerState === "settled";
    downloadReceiptPdf({
      reference,
      title: settled ? "Repayment Receipt" : "Repayment Request Record",
      status: settled ? "Provider-confirmed settled" : providerState === "failed" ? "Not settled" : "Pending provider confirmation",
      amount,
      dateISO: when.toISOString(),
      rows: [
        { label: "Method", value: method },
        { label: "Type", value: "Loan Repayment" },
        { label: "Provider state", value: providerStatus },
      ],
      footerNote: settled
        ? "This receipt reflects a repayment Kuula recorded only after payment-provider settlement confirmation."
        : "This record is not proof of repayment. Kuula reduces the outstanding balance only after payment-provider settlement confirmation.",
    });
  };

  const { Icon } = visual;

  return (
    <div className="flex flex-col h-full bg-white items-center" style={{ paddingTop: 0 }}>
      <div className="w-full flex flex-col items-center pt-8 pb-10" style={{ background: visual.bg }}>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: "white", boxShadow: "0 8px 28px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Icon size={54} color={visual.icon} strokeWidth={1.6} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: visual.text, letterSpacing: -0.5, margin: 0 }}>{visual.title}</h1>
        <p style={{ fontSize: 13, color: visual.text, opacity: 0.85, marginTop: 6, textAlign: "center", padding: "0 24px", lineHeight: 1.55 }}>{visual.subtitle}</p>
      </div>

      <div className="w-full px-6 -mt-6">
        <div className="rounded-2xl p-5" style={{ background: "white", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 12, color: "#7A8B82", textAlign: "center", margin: 0 }}>{providerState === "settled" ? "Amount Settled" : "Amount Requested"}</p>
          <p style={{ fontSize: 40, fontWeight: 900, color: "#1F2937", textAlign: "center", letterSpacing: -1, margin: "4px 0 0" }}>{formatUGX(amount)}</p>
          <div style={{ borderTop: "1px dashed #DCE6E0", margin: "16px 0" }} />
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between py-2" style={{ gap: 12 }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", textAlign: "right" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end px-6 pb-12 gap-3 w-full">
        <button onClick={saveRecord} style={{ width: "100%", height: 52, borderRadius: 14, background: providerState === "settled" ? "#0B5E3A" : "#425149", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Download size={18} /> {providerState === "settled" ? "Download Receipt" : "Download Request Record"}
        </button>
        <button onClick={() => onNavigate(providerState === "failed" ? "make-payment" : "loan-detail")} style={{ width: "100%", height: 52, borderRadius: 14, background: "#F3F5F4", color: "#374151", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}>
          {providerState === "failed" ? "Try Again" : "View Credit"}
        </button>
      </div>
    </div>
  );
}
