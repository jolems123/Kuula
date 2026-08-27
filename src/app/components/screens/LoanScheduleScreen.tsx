import { ArrowLeft, CheckCircle, Clock, Calendar } from "lucide-react";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

const SCHEDULE = [
  { n: 1, date: "Jun 25, 2026", amount: 92083, status: "paid", method: "MTN MoMo" },
  { n: 2, date: "Jul 25, 2026", amount: 92083, status: "paid", method: "MTN MoMo" },
  { n: 3, date: "Aug 25, 2026", amount: 92083, status: "due", method: null },
  { n: 4, date: "Sep 25, 2026", amount: 92083, status: "upcoming", method: null },
  { n: 5, date: "Oct 25, 2026", amount: 92083, status: "upcoming", method: null },
  { n: 6, date: "Nov 25, 2026", amount: 92083, status: "upcoming", method: null },
];

export function LoanScheduleScreen({ onNavigate }: Props) {
  const paid = SCHEDULE.filter((s) => s.status === "paid").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Repayment Schedule</span>
      </div>

      {/* Progress summary */}
      <div style={{ background: "white", padding: "16px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#6B7280" }}>{paid} of {SCHEDULE.length} instalments paid</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#178654" }}>{Math.round((paid / SCHEDULE.length) * 100)}% complete</span>
        </div>
        <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4 }}>
          <div style={{ width: `${(paid / SCHEDULE.length) * 100}%`, height: "100%", background: "linear-gradient(90deg, #178654, #059669)", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[
            { label: "Total Loan", value: ugx(500000) },
            { label: "Paid So Far", value: ugx(paid * 92083) },
            { label: "Remaining", value: ugx((SCHEDULE.length - paid) * 92083) },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#1F2937", margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
        {SCHEDULE.map((item) => {
          const isPaid = item.status === "paid";
          const isDue = item.status === "due";
          return (
            <div
              key={item.n}
              style={{
                background: isDue ? "#FFF7ED" : "white",
                border: `1px solid ${isDue ? "#FED7AA" : "#F3F4F6"}`,
                borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 14,
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isPaid ? "#F0FDF4" : isDue ? "#FEF3C7" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isPaid
                  ? <CheckCircle size={20} color="#178654" />
                  : isDue
                  ? <Clock size={20} color="#F59E0B" />
                  : <Calendar size={20} color="#9CA3AF" />
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>Instalment {item.n}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: isPaid ? "#178654" : isDue ? "#D97706" : "#1F2937" }}>{ugx(item.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{item.date}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isPaid ? "#178654" : isDue ? "#D97706" : "#9CA3AF" }}>
                    {isPaid ? `✓ Paid via ${item.method}` : isDue ? "⚠ Due Soon" : "Scheduled"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
