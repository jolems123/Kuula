import { Clock, CheckCircle, XCircle, Home, FileText } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { env } from "../../config/env";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

type Status = "pending" | "offered" | "approved" | "rejected";

function ugx(n: number) { return "UGX " + n.toLocaleString(); }
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LoanApprovalScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  // With the backend on, the status tracks the admin's real decision and
  // updates live while the customer watches this screen.
  const useServer = env.USE_API && !!token;
  const [app, setApp] = useState<LoanApplication | null>(null);

  const refresh = useCallback(async () => {
    if (!useServer || !token) return;
    try {
      const { applications } = await api.getApplications(token);
      if (applications.length) setApp(applications[0]); // newest first
    } catch { /* keep last known status */ }
  }, [useServer, token]);

  useEffect(() => {
    if (!useServer) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [useServer, refresh]);

  // Map the full loan lifecycle onto the three states this screen renders:
  // a disbursed/active/paid loan reads as "approved"; a failed one as "rejected".
  const toDisplayStatus = (s: LoanApplication["status"] | undefined): Status => {
    if (s === "approved" || s === "active" || s === "paid" || s === "overdue") return "approved";
    if (s === "offered") return "offered";
    if (s === "rejected" || s === "failed") return "rejected";
    return "pending";
  };
  const status: Status = useServer ? toDisplayStatus(app?.status) : "approved";
  const phone = state.user?.phone ?? "";

  const config = {
    pending: {
      Icon: Clock, color: "#F59E0B", bg: "#FFF7ED", border: "#FED7AA",
      title: "Application Under Review",
      sub: "Your application is being verified. This usually takes 2–5 minutes.",
      badge: { text: "Pending Review", color: "#92400E", bg: "#FEF3C7" },
    },
    offered: {
      Icon: FileText, color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE",
      title: "Loan Approved — Action Required",
      sub: "Review and accept your loan agreement to receive your funds.",
      badge: { text: "Awaiting Your Acceptance", color: "#5B21B6", bg: "#EDE9FE" },
    },
    approved: {
      Icon: CheckCircle, color: "#10B981", bg: "#F0FDF4", border: "#A7F3D0",
      title: "Loan Approved! 🎉",
      sub: "Congratulations! Your loan has been approved and disbursed to your MTN MoMo account.",
      badge: { text: "Approved", color: "#065F46", bg: "#DCFCE7" },
    },
    rejected: {
      Icon: XCircle, color: "#EF4444", bg: "#FEF2F2", border: "#FECACA",
      title: "Application Not Approved",
      sub: "We're unable to approve this application at this time. You can reapply after 30 days.",
      badge: { text: "Not Approved", color: "#991B1B", bg: "#FEE2E2" },
    },
  }[status];

  const { Icon } = config;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0, alignItems: "center" }}>
      {/* Status band */}
      <div style={{ width: "100%", background: config.bg, padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, borderBottom: `1px solid ${config.border}` }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: "white", boxShadow: `0 8px 24px ${config.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={52} color={config.color} strokeWidth={1.5} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>{config.title}</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>{config.sub}</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: config.badge.color, background: config.badge.bg, padding: "4px 16px", borderRadius: 20 }}>
          ● {config.badge.text}
        </span>
      </div>

      {/* Details */}
      <div style={{ width: "100%", flex: 1, overflowY: "auto", padding: "20px 16px 120px", display: "flex", flexDirection: "column", gap: 14 }}>
        {status === "approved" && (
          <div style={{ background: "linear-gradient(135deg, #FFF0E8, #FFDCC8)", borderRadius: 16, padding: "16px", border: "1px solid #FFDCC8" }}>
            <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, margin: "0 0 4px" }}>Amount Disbursed</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#E05A2B", margin: 0 }}>{app ? ugx(app.amount) : "—"}</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>{phone ? `Sent to your mobile money ${phone}` : "Sent to your mobile money"}</p>
          </div>
        )}

        {status === "offered" && (
          <div style={{ background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)", borderRadius: 16, padding: "16px", border: "1px solid #DDD6FE" }}>
            <p style={{ fontSize: 12, color: "#5B21B6", fontWeight: 600, margin: "0 0 4px" }}>Approved Amount</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: "#4C1D95", margin: 0 }}>{app ? ugx(app.amount) : "—"}</p>
            <p style={{ fontSize: 12, color: "#6D28D9", margin: "4px 0 0" }}>Accept your loan agreement to receive this on your mobile money{phone ? ` (${phone})` : ""}.</p>
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          {[
            { label: "Application ID", value: app?.id ?? "—" },
            { label: "Applied On", value: app ? fmtDateTime(app.createdAt) : "—" },
            { label: "Decision Time", value: status === "pending" ? "In progress..." : (app ? fmtDateTime(app.decidedAt) : "—") },
            { label: "Total Repayment", value: app && app.total > 0 ? ugx(app.total) : "—" },
          ].map((row, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{row.value}</span>
            </div>
          ))}
        </div>

        {status === "rejected" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "14px", border: "1px solid #FECACA" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", margin: "0 0 6px" }}>Why was my application declined?</p>
            <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.6 }}>
              Common reasons include: insufficient credit history, unverified ID, or exceeding your current credit limit. Improve your credit score and reapply in 30 days.
            </p>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6", display: "flex", gap: 10 }}>
        <button onClick={() => onNavigate("home")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#F3F4F6", color: "#374151", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Home size={16} /> Home
        </button>
        {status === "offered" && (
          <button onClick={() => onNavigate("loan-agreement")} style={{ flex: 1, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #7C3AED, #5B21B6)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <FileText size={16} /> Review &amp; Accept Terms
          </button>
        )}
        {status === "approved" && (
          <button onClick={() => onNavigate("loan-detail")} style={{ flex: 1, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <FileText size={16} /> View Loan
          </button>
        )}
        {status === "rejected" && (
          <button onClick={() => onNavigate("loan-apply")} style={{ flex: 1, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
