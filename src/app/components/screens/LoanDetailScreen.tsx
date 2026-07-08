import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { env } from "../../config/env";

interface Props {
  onNavigate: (screen: string) => void;
}

function formatUGX(n: number) {
  return "UGX " + n.toLocaleString("en-UG");
}

type PayStatus = "paid" | "pending" | "upcoming" | "failed";
interface PayRow { date: string; amount: number; status: PayStatus; }

// Offline demo build only — illustrative schedule, never shown in server mode.
const DEMO_HISTORY: PayRow[] = [
  { date: "May 25, 2026", amount: 285000, status: "paid" },
  { date: "Apr 25, 2026", amount: 285000, status: "paid" },
  { date: "Mar 25, 2026", amount: 285000, status: "paid" },
  { date: "Jun 25, 2026", amount: 285000, status: "pending" },
  { date: "Jul 25, 2026", amount: 285000, status: "upcoming" },
  { date: "Aug 25, 2026", amount: 285000, status: "upcoming" },
];

export function LoanDetailScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const useServer = env.USE_API && !!token;

  const activeLoan = state.loan?.activeLoan ?? null;
  const nextPayment = state.loan?.nextPayment ?? null;

  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(useServer);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!useServer || !token) return;
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([api.getRepayment(token), api.getTransactions(token)])
      .then(([rep, txns]) => {
        if (!active) return;
        const r = rep.repayment;
        if (r) {
          const total = Number(r.total ?? 0);
          const paid = Number(r.amountPaid ?? 0);
          setOutstanding(Math.max(0, total - paid));
        } else {
          setOutstanding(null);
        }
        const rows: PayRow[] = (txns.transactions ?? [])
          .filter((tx: Record<string, unknown>) => String(tx.type ?? "") === "loan_payment")
          .map((tx: Record<string, unknown>) => {
            const s = String(tx.status ?? "");
            const status: PayStatus = s === "completed" ? "paid" : s === "pending" ? "pending" : "failed";
            return {
              date: tx.created_at
                ? new Date(String(tx.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—",
              amount: Math.abs(Number(tx.amount ?? 0)),
              status,
            };
          });
        setPayments(rows);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [useServer, token]);

  const header = (
    <div
      className="flex items-center justify-between px-4 pt-4 pb-4"
      style={{ background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate("home")}
          style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>{t("loanDetail.title")}</span>
      </div>
      {activeLoan && (
        <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", background: "#F0FDF4", padding: "4px 12px", borderRadius: 20 }}>
          {t("loanDetail.activeStatus")}
        </span>
      )}
    </div>
  );

  const centered = (msg: string, color: string) => (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      {header}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ fontSize: 14, color, textAlign: "center", fontWeight: 600 }}>{msg}</p>
      </div>
    </div>
  );

  // ── Server mode: loading / error / no-loan states ─────────────────────────
  if (useServer && loading) return centered(`${t("common.loading")}…`, "#9CA3AF");
  if (useServer && error) return centered(t("loanDetail.loadError"), "#EF4444");
  if (useServer && !activeLoan) return centered(t("loanDetail.noActiveLoan"), "#6B7280");

  // ── Resolve display values from real data (server) or demo constants ──────
  const demo = !useServer;
  const totalBorrowed = demo ? 500000 : Number(activeLoan?.amount ?? 0);
  const balanceRemaining = demo ? 290000 : outstanding;
  const pct = demo ? 50 : Number(activeLoan?.repaidPercent ?? 0);
  const history: PayRow[] = demo ? DEMO_HISTORY : payments;

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      {header}

      {/* Hero card */}
      <div className="mx-4 mt-4 p-5 rounded-2xl" style={{ background: "white", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <p style={{ fontSize: 12, color: "#6B7280" }}>{t("loanDetail.totalBorrowed")}</p>
        <p style={{ fontSize: 32, fontWeight: 800, color: "#1F2937", letterSpacing: -1 }}>
          {formatUGX(totalBorrowed)}
        </p>
        {balanceRemaining != null && (
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {t("loanDetail.balanceRemaining")}{" "}
            <span style={{ color: "#EF4444", fontWeight: 700 }}>{formatUGX(balanceRemaining)}</span>
          </p>
        )}

        <div className="mt-4">
          <div className="flex justify-between mb-1.5">
            <span style={{ fontSize: 12, color: "#6B7280" }}>{t("loanDetail.repaymentProgress")}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>{t("loanDetail.percentPaid", { pct })}</span>
          </div>
          <div style={{ height: 10, background: "#F3F4F6", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #10B981, #059669)", borderRadius: 5, transition: "width 0.4s ease" }} />
          </div>
        </div>

        {/* Info row — real, available fields only */}
        <div className="flex gap-3 mt-4">
          {[
            { label: t("loanDetail.status"), value: demo ? t("loanDetail.activeStatus") : String(activeLoan?.status ?? "—") },
            { label: t("loanDetail.disbursed"), value: demo ? "Jun 1, 2026" : String(activeLoan?.disbursedDate ?? "—") },
            { label: t("loanDetail.nextPayment"), value: (demo ? "Jun 25, 2026" : (nextPayment?.dueDate ?? "—")) },
          ].map((item) => (
            <div key={item.label} className="flex-1 text-center p-2 rounded-xl" style={{ background: "#F9FAFB" }}>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>{item.label}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#1F2937", marginTop: 2 }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Next payment */}
      {(demo || nextPayment) && (
        <div className="mx-4 mt-3 p-4 rounded-2xl flex items-center justify-between" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
          <div>
            <p style={{ fontSize: 12, color: "#92400E", fontWeight: 500 }}>{t("loanDetail.nextPaymentDue")}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{formatUGX(demo ? 285000 : Number(nextPayment?.amount ?? 0))}</p>
          </div>
          <div className="text-right">
            <p style={{ fontSize: 12, color: "#B45309" }}>{demo ? "Jun 25, 2026" : (nextPayment?.dueDate ?? "—")}</p>
            <p style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600, marginTop: 2 }}>{t("loanDetail.daysLeft", { count: demo ? 14 : (nextPayment?.daysLeft ?? 0) })}</p>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="mx-4 mt-3 p-4 rounded-2xl flex-1" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", maxHeight: 220, overflow: "hidden" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 8 }}>{t("loanDetail.paymentHistory")}</p>
        <div className="overflow-y-auto" style={{ maxHeight: 160 }}>
          {history.length === 0 && (
            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>{t("home.noRecentTxns")}</p>
          )}
          {history.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5"
              style={{ borderBottom: i < history.length - 1 ? "1px solid #F3F4F6" : "none" }}
            >
              <div className="flex items-center gap-3">
                {item.status === "paid" ? (
                  <CheckCircle size={18} color="#10B981" />
                ) : item.status === "pending" ? (
                  <Clock size={18} color="#F59E0B" />
                ) : item.status === "failed" ? (
                  <XCircle size={18} color="#EF4444" />
                ) : (
                  <div style={{ width: 18, height: 18, borderRadius: 9, border: "2px solid #D1D5DB" }} />
                )}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{item.date}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {item.status === "paid" ? t("loanDetail.paid") : item.status === "pending" ? t("loanDetail.dueSoon") : item.status === "failed" ? t("makePayment.paymentFailed") : t("loanDetail.upcoming")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{formatUGX(item.amount)}</p>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: item.status === "paid" ? "#10B981" : item.status === "pending" ? "#F59E0B" : item.status === "failed" ? "#EF4444" : "#9CA3AF",
                  }}
                >
                  {item.status === "paid" ? t("loanDetail.paid") : item.status === "pending" ? t("loanDetail.due") : item.status === "failed" ? t("loanDetail.due") : t("loanDetail.scheduled")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3 flex gap-3" style={{ background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={() => onNavigate("confirm")}
          style={{ flex: 1, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 15, fontWeight: 700, border: "none", boxShadow: "0 4px 12px rgba(13,92,58,0.3)" }}
        >
          {t("loanDetail.makePayment")}
        </button>
        <button
          style={{ flex: 1, height: 50, borderRadius: 14, background: "#F3F4F6", color: "#374151", fontSize: 15, fontWeight: 600, border: "none" }}
        >
          {t("loanDetail.viewAgreement")}
        </button>
      </div>
    </div>
  );
}
