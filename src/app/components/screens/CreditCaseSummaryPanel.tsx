import { AlertTriangle, CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import { AdminCard } from "../AdminLayout";

const BORDER = "#E2E8F0";
const GREEN = "#0B5E3A";
const ugx = (value: unknown) => value == null ? "—" : `UGX ${Math.round(Number(value)).toLocaleString("en-UG")}`;

function statusLabel(value: string) {
  if (value === "verified") return "Verified";
  if (value === "received") return "Received";
  if (value === "not_provided") return "Not provided";
  return "Missing";
}

export function CreditCaseSummaryPanel({ detail }: { detail: Record<string, any> }) {
  const application = detail.application || {};
  const livelihood = application.livelihood || {};
  const affordability = application.affordability || {};
  const risk = detail.riskSummary || {};
  const checklist = (detail.documentChecklist || []) as Array<Record<string, any>>;
  const evaluation = detail.evaluations?.[0] || {};
  const requested = Number(application.amount || 0);
  const underwritten = affordability.approvedLimit == null ? application.underwriting?.approvedLimit : affordability.approvedLimit;
  const officerRecommended = evaluation.recommended_amount == null ? null : Number(evaluation.recommended_amount);
  const missing = (risk.missingRequiredEvidence || []) as string[];

  return <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
    <AdminCard>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {risk.status === "clear" ? <ShieldCheck size={18} color={GREEN}/> : <AlertTriangle size={18} color="#B45309"/>}
        <h3 style={{ margin: 0 }}>Credit risk summary</h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 }}>
        {[
          ["Requested", ugx(requested)],
          ["System approved limit", ugx(underwritten)],
          ["Max affordable repayment", ugx(affordability.maxAffordablePayment ?? application.underwriting?.maxAffordablePayment)],
          ["Officer recommendation", ugx(officerRecommended)],
        ].map(([label,value]) => <div key={label} style={{ padding: 10, border: `1px solid ${BORDER}`, borderRadius: 10 }}><div style={{ fontSize: 10, color: "#64748B", fontWeight: 800, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{value}</div></div>)}
      </div>
      {risk.requestedAboveLimit && <div style={{ marginTop: 10, padding: 9, borderRadius: 9, background: "#FFF7ED", color: "#9A3412", fontSize: 12 }}>Requested amount exceeds the current system-approved limit.</div>}
      {missing.length > 0 && <div style={{ marginTop: 8, padding: 9, borderRadius: 9, background: "#FEF2F2", color: "#991B1B", fontSize: 12 }}>Missing required evidence: {missing.join(", ")}.</div>}
      {(risk.flags || []).length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#64748B" }}>Underwriting flags: {(risk.flags as string[]).join(", ")}</div>}
    </AdminCard>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <AdminCard>
        <h3 style={{ marginTop: 0 }}>Borrower declarations</h3>
        {[
          ["Employment / livelihood", livelihood.employmentStatus],
          ["Occupation / activity", livelihood.occupationOrBusiness],
          ["Employer / business", livelihood.employerOrBusinessName],
          ["Time in work / business", livelihood.workDuration],
          ["Primary income source", livelihood.incomeSource],
          ["Primary repayment source", livelihood.repaymentSource],
        ].map(([label,value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}><span style={{ color: "#64748B" }}>{label}</span><strong style={{ textAlign: "right" }}>{value || "—"}</strong></div>)}
      </AdminCard>
      <AdminCard>
        <h3 style={{ marginTop: 0 }}>Affordability evidence</h3>
        {[
          ["Declared monthly income", ugx(affordability.declaredMonthlyIncome)],
          ["Verified monthly income", affordability.verifiedMonthlyIncome == null ? "Not independently verified" : ugx(affordability.verifiedMonthlyIncome)],
          ["Declared monthly expenses", ugx(affordability.declaredMonthlyExpenses)],
          ["Existing monthly debt", ugx(affordability.existingDebtPayment)],
          ["Disposable income", ugx(affordability.disposableIncome)],
        ].map(([label,value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}><span style={{ color: "#64748B" }}>{label}</span><strong style={{ textAlign: "right" }}>{value}</strong></div>)}
        <p style={{ fontSize: 10.5, color: "#64748B", lineHeight: 1.5, marginBottom: 0 }}>Declared income is shown separately from independently verified income and must not be treated as verified evidence.</p>
      </AdminCard>
    </div>

    <AdminCard>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><FileCheck2 size={18} color={GREEN}/><h3 style={{ margin: 0 }}>Document & evidence checklist</h3></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
        {checklist.map((item) => {
          const ok = item.status === "verified" || item.status === "received";
          return <div key={item.key} style={{ border: `1px solid ${ok ? "#BBF7D0" : item.required ? "#FECACA" : BORDER}`, background: ok ? "#F0FDF4" : item.required ? "#FEF2F2" : "#F8FAFC", padding: 10, borderRadius: 10 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>{ok ? <CheckCircle2 size={15} color={GREEN}/> : <AlertTriangle size={15} color={item.required ? "#B91C1C" : "#64748B"}/>}<strong style={{ fontSize: 12 }}>{item.label}</strong><span style={{ marginLeft: "auto", fontSize: 10, color: "#64748B" }}>{item.required ? "Required" : "Conditional"}</span></div>
            <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>{statusLabel(String(item.status))} · {item.detail}</div>
          </div>;
        })}
      </div>
    </AdminCard>
  </div>;
}
