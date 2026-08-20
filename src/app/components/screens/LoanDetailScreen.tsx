import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { env } from "../../config/env";

interface Props {
  onNavigate: (screen: string) => void;
}

function formatUGX(n: number) {
  return "UGX " + Math.round(n).toLocaleString("en-UG");
}
function fmtDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

type PayStatus = "paid" | "pending" | "failed";
interface PayRow { id: string; date: string; amount: number; status: PayStatus; }

export function LoanDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const useServer = env.USE_API && !!token;

  const [facility, setFacility] = useState<LoanApplication | null>(null);
  const [repaymentTotal, setRepaymentTotal] = useState<number | null>(null);
  const [amountPaid, setAmountPaid] = useState(0);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [daysToDue, setDaysToDue] = useState<number | null>(null);
  const [collectionLabel, setCollectionLabel] = useState<string | null>(null);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(useServer);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!useServer || !token) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api.getApplications(token), api.getRepayment(token), api.getTransactions(token)])
      .then(([apps, rep, txns]) => {
        if (!active) return;
        const candidate = apps.applications.find((item) => ["active", "overdue", "disbursing"].includes(item.status))
          ?? apps.applications.find((item) => item.status === "paid")
          ?? null;
        setFacility(candidate);

        const r = rep.repayment;
        if (r) {
          const total = Number(r.total ?? 0);
          const paid = Number(r.amountPaid ?? r.amount_paid ?? 0);
          setRepaymentTotal(total);
          setAmountPaid(paid);
          setOutstanding(Math.max(0, total - paid));
          setDueDate(String(r.due_date ?? ""));
          setDaysToDue(Number(r.collection?.daysToDue ?? 0));
          setCollectionLabel(r.collection?.label ?? null);
        } else {
          setRepaymentTotal(null);
          setAmountPaid(0);
          setOutstanding(null);
          setDueDate(null);
          setDaysToDue(null);
          setCollectionLabel(null);
        }

        const rows: PayRow[] = (txns.transactions ?? [])
          .filter((tx: Record<string, unknown>) => String(tx.type ?? "") === "loan_payment")
          .map((tx: Record<string, unknown>) => {
            const raw = String(tx.status ?? "").toLowerCase();
            const status: PayStatus = ["completed", "settled", "paid", "success", "successful"].includes(raw)
              ? "paid"
              : raw === "pending"
                ? "pending"
                : "failed";
            return {
              id: String(tx.id ?? tx.reference ?? Math.random()),
              date: fmtDate(tx.createdAt),
              amount: Math.abs(Number(tx.amount ?? 0)),
              status,
            };
          });
        setPayments(rows);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load your credit details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [useServer, token]);

  if (!useServer) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#F8FAF9", padding: 24 }}>
        <div style={{ maxWidth: 340, textAlign: "center" }}><h2 style={{ color: "#13251C" }}>Credit details require the Kuula API</h2><p style={{ color: "#68766F" }}>Connect the development API to review server-backed facility, repayment and payment history data.</p></div>
      </div>
    );
  }

  const header = (
    <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#0B5E3A" }}>
      <button aria-label="Back home" onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
      <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Credit Details</span>
    </div>
  );

  if (loading) return <div style={{ height: "100%", background: "#F8FAF9" }}>{header}<div style={{ padding: 28, textAlign: "center", color: "#68766F" }}>Loading current credit details…</div></div>;
  if (error) return <div style={{ height: "100%", background: "#F8FAF9" }}>{header}<div role="alert" style={{ padding: 28, textAlign: "center", color: "#B42318" }}>{error}</div></div>;
  if (!facility) return <div style={{ height: "100%", background: "#F8FAF9" }}>{header}<div style={{ padding: 28, textAlign: "center", color: "#68766F" }}>No active or recently completed credit facility was found.</div></div>;

  const pct = repaymentTotal && repaymentTotal > 0 ? Math.min(100, Math.max(0, Math.round((amountPaid / repaymentTotal) * 100))) : facility.status === "paid" ? 100 : 0;
  const canRepay = outstanding != null && outstanding > 0 && ["active", "overdue"].includes(facility.status);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9" }}>
      {header}

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 120px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "white", padding: 18, borderRadius: 16, boxShadow: "0 3px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 11, color: "#75847C", margin: 0 }}>Approved Principal</p>
              <p style={{ fontSize: 30, fontWeight: 900, color: "#13251C", margin: "3px 0 0" }}>{formatUGX(facility.amount)}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: facility.status === "overdue" ? "#991B1B" : "#0B5E3A", background: facility.status === "overdue" ? "#FEF2F2" : "#EEF7F2", padding: "5px 10px", borderRadius: 20 }}>{facility.status.replace(/_/g, " ")}</span>
          </div>

          {repaymentTotal != null && (
            <div style={{ marginTop: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: "#68766F" }}>Repayment progress</span><strong style={{ color: "#0B5E3A" }}>{pct}%</strong></div>
              <div style={{ height: 9, background: "#E8EFEB", borderRadius: 6, overflow: "hidden", marginTop: 6 }}><div style={{ width: `${pct}%`, height: "100%", background: "#0B5E3A" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div style={{ background: "#F8FAF9", padding: 10, borderRadius: 10 }}><div style={{ fontSize: 10, color: "#7A8B82" }}>Paid</div><strong style={{ fontSize: 13, color: "#263A30" }}>{formatUGX(amountPaid)}</strong></div>
                <div style={{ background: "#F8FAF9", padding: 10, borderRadius: 10 }}><div style={{ fontSize: 10, color: "#7A8B82" }}>Outstanding</div><strong style={{ fontSize: 13, color: outstanding && outstanding > 0 ? "#B45309" : "#0B5E3A" }}>{formatUGX(outstanding ?? 0)}</strong></div>
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #EEF2EF", marginTop: 14, paddingTop: 12, display: "grid", gap: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}><span style={{ color: "#75847C" }}>Purpose</span><strong style={{ color: "#263A30", textAlign: "right" }}>{facility.purpose}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}><span style={{ color: "#75847C" }}>Term</span><strong style={{ color: "#263A30" }}>{facility.termDays} days</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}><span style={{ color: "#75847C" }}>Application</span><strong style={{ color: "#263A30", wordBreak: "break-all", textAlign: "right" }}>{facility.id}</strong></div>
            {dueDate && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}><span style={{ color: "#75847C" }}>Due date</span><strong style={{ color: daysToDue != null && daysToDue < 0 ? "#991B1B" : "#263A30" }}>{fmtDate(dueDate)}</strong></div>}
            {collectionLabel && <div style={{ fontSize: 11, color: "#68766F", marginTop: 2 }}>{collectionLabel}</div>}
          </div>
        </div>

        <div style={{ background: "white", padding: 16, borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 8px" }}>Repayment Transactions</p>
          {payments.length === 0 && <p style={{ fontSize: 12, color: "#87968E", textAlign: "center", padding: "12px 0", margin: 0 }}>No repayment transactions yet.</p>}
          {payments.map((item, i) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: i < payments.length - 1 ? "1px solid #F0F3F1" : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {item.status === "paid" ? <CheckCircle size={18} color="#0B5E3A" /> : item.status === "pending" ? <Clock size={18} color="#9A6A00" /> : <XCircle size={18} color="#B42318" />}
                <div><div style={{ fontSize: 12, fontWeight: 700, color: "#263A30" }}>{item.date}</div><div style={{ fontSize: 10, color: "#87968E" }}>{item.status === "paid" ? "Provider confirmed" : item.status === "pending" ? "Awaiting provider" : "Not settled"}</div></div>
              </div>
              <strong style={{ fontSize: 12, color: "#263A30" }}>{formatUGX(item.amount)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 34px", background: "white", borderTop: "1px solid #E8EEEA", display: "flex", gap: 10 }}>
        <button disabled={!canRepay} onClick={() => onNavigate("make-payment")} style={{ flex: 1, height: 50, borderRadius: 14, background: canRepay ? "#0B5E3A" : "#D7E1DB", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: canRepay ? "pointer" : "not-allowed" }}>Make Repayment</button>
        <button onClick={() => onNavigate("loan-agreement")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#F3F5F4", color: "#374151", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>View Agreement</button>
      </div>
    </div>
  );
}
