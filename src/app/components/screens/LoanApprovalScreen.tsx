import { Clock, CheckCircle, XCircle, Home, FileText, Send } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { env } from "../../config/env";

interface Props { onNavigate: (s: string) => void; }

type Status = "pending" | "offered" | "disbursing" | "approved" | "rejected";

function ugx(n: number) { return "UGX " + n.toLocaleString(); }
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LoanApprovalScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const useServer = env.USE_API && !!token;
  const [app, setApp] = useState<LoanApplication | null>(null);

  const refresh = useCallback(async () => {
    if (!useServer || !token) return;
    try {
      const { applications } = await api.getApplications(token);
      if (applications.length) setApp(applications[0]);
    } catch {
      // Preserve the last known server state during a temporary network failure.
    }
  }, [useServer, token]);

  useEffect(() => {
    if (!useServer) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [useServer, refresh]);

  const toDisplayStatus = (status: LoanApplication["status"] | undefined): Status => {
    if (status === "active" || status === "paid" || status === "overdue") return "approved";
    if (status === "disbursing") return "disbursing";
    if (status === "offered") return "offered";
    if (status === "rejected" || status === "failed") return "rejected";
    return "pending";
  };

  const status: Status = useServer ? toDisplayStatus(app?.status) : "approved";
  const phone = state.user?.phone ?? "";
  const isDirectPayee = Boolean(app?.partnerFinancingRequestId || app?.payeeName || app?.partnerName);
  const settlementTarget = app?.payeeName || app?.partnerName || "the verified partner";

  const config = {
    pending: {
      Icon: Clock,
      color: "#B7791F",
      bg: "#FFF9E8",
      border: "#F6E4A5",
      title: "Application Under Review",
      sub: "Kuula is reviewing your identity, affordability and supporting information. We will update you here when the review changes.",
      badge: { text: "Pending Review", color: "#7C5B14", bg: "#FFF1B8" },
    },
    offered: {
      Icon: FileText,
      color: "#0B5E3A",
      bg: "#EEF7F2",
      border: "#C9E2D4",
      title: "Credit Approved — Action Required",
      sub: "Review and accept your credit agreement. The agreement shows the approved amount, repayment terms and settlement destination.",
      badge: { text: "Awaiting Your Acceptance", color: "#064A2E", bg: "#DDEFE5" },
    },
    disbursing: {
      Icon: Send,
      color: "#2563EB",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      title: isDirectPayee ? "Paying the Verified Partner" : "Sending Your Funds",
      sub: isDirectPayee
        ? `Kuula is processing payment to ${settlementTarget}. We will confirm here only after the payment provider settles it.`
        : "Your Mobile Money disbursement is processing. We will confirm here only after the payment provider settles it.",
      badge: { text: "Settlement Pending", color: "#1E40AF", bg: "#DBEAFE" },
    },
    approved: {
      Icon: CheckCircle,
      color: "#0B5E3A",
      bg: "#EEF7F2",
      border: "#BFE1CD",
      title: isDirectPayee ? "Partner Payment Confirmed" : "Disbursement Confirmed",
      sub: isDirectPayee
        ? `The payment provider has confirmed settlement to ${settlementTarget}.`
        : "The payment provider has confirmed that your Mobile Money disbursement settled successfully.",
      badge: { text: "Settled", color: "#064A2E", bg: "#DDEFE5" },
    },
    rejected: {
      Icon: XCircle,
      color: "#B42318",
      bg: "#FEF3F2",
      border: "#FECACA",
      title: "Application Not Approved",
      sub: "Kuula cannot approve this application at this time. Review your Credit Pass and eligibility information before applying again.",
      badge: { text: "Not Approved", color: "#991B1B", bg: "#FEE2E2" },
    },
  }[status];

  const { Icon } = config;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9", paddingTop: 0, alignItems: "center" }}>
      <div style={{ width: "100%", background: config.bg, padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, borderBottom: `1px solid ${config.border}` }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: "white", boxShadow: `0 8px 24px ${config.color}24`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={52} color={config.color} strokeWidth={1.5} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>{config.title}</h1>
          <p style={{ fontSize: 13, color: "#5F6F66", marginTop: 8, lineHeight: 1.6 }}>{config.sub}</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: config.badge.color, background: config.badge.bg, padding: "4px 16px", borderRadius: 20 }}>
          ● {config.badge.text}
        </span>
      </div>

      <div style={{ width: "100%", flex: 1, overflowY: "auto", padding: "20px 16px 120px", display: "flex", flexDirection: "column", gap: 14 }}>
        {status === "approved" && (
          <div style={{ background: "#EEF7F2", borderRadius: 16, padding: "16px", border: "1px solid #C9E2D4" }}>
            <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, margin: "0 0 4px" }}>Amount Settled</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#0B5E3A", margin: 0 }}>{app ? ugx(app.amount) : "—"}</p>
            <p style={{ fontSize: 12, color: "#5F6F66", margin: "4px 0 0" }}>
              {isDirectPayee ? `Provider-confirmed payment to ${settlementTarget}` : phone ? `Provider-confirmed payment to ${phone}` : "Provider-confirmed Mobile Money payment"}
            </p>
          </div>
        )}

        {status === "offered" && (
          <div style={{ background: "#EEF7F2", borderRadius: 16, padding: "16px", border: "1px solid #C9E2D4" }}>
            <p style={{ fontSize: 12, color: "#064A2E", fontWeight: 600, margin: "0 0 4px" }}>Approved Amount</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#0B5E3A", margin: 0 }}>{app ? ugx(app.amount) : "—"}</p>
            <p style={{ fontSize: 12, color: "#37644F", margin: "4px 0 0" }}>
              {isDirectPayee
                ? `Accept the agreement to request settlement to ${settlementTarget}.`
                : `Accept the agreement to request Mobile Money disbursement${phone ? ` to ${phone}` : ""}.`}
            </p>
          </div>
        )}

        {status === "disbursing" && (
          <div style={{ background: "#EFF6FF", borderRadius: 16, padding: "16px", border: "1px solid #BFDBFE" }}>
            <p style={{ fontSize: 12, color: "#1E40AF", fontWeight: 700, margin: "0 0 4px" }}>Processing Amount</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#1D4ED8", margin: 0 }}>{app ? ugx(app.amount) : "—"}</p>
            <p style={{ fontSize: 12, color: "#1E3A8A", margin: "4px 0 0" }}>Do not submit the offer again. This screen refreshes automatically when the payment provider responds.</p>
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          {[
            { label: "Application ID", value: app?.id ?? "—" },
            { label: "Applied On", value: app ? fmtDateTime(app.createdAt) : "—" },
            { label: "Decision Time", value: status === "pending" ? "In progress..." : (app ? fmtDateTime(app.decidedAt) : "—") },
            { label: "Total Repayment", value: app && app.total > 0 ? ugx(app.total) : "—" },
          ].map((row, index, rows) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: index < rows.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{row.value}</span>
            </div>
          ))}
        </div>

        {status === "rejected" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "14px", border: "1px solid #FECACA" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", margin: "0 0 6px" }}>What can I do next?</p>
            <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.6 }}>
              Check your Credit Pass for identity, credit-data and repayment signals. A future application is always reassessed using your current eligibility and affordability.
            </p>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA", display: "flex", gap: 10 }}>
        <button onClick={() => onNavigate("home")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#F3F5F4", color: "#374151", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Home size={16} /> Home
        </button>
        {status === "offered" && (
          <button onClick={() => onNavigate("loan-agreement")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <FileText size={16} /> Review &amp; Accept Terms
          </button>
        )}
        {status === "approved" && (
          <button onClick={() => onNavigate("loan-detail")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <FileText size={16} /> View Credit
          </button>
        )}
        {status === "rejected" && (
          <button onClick={() => onNavigate("credit-dashboard")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
            View Credit Pass
          </button>
        )}
      </div>
    </div>
  );
}
