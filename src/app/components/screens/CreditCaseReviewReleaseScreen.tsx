import { useEffect, useState } from "react";
import { ArrowLeft, FileText, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { AdminLayout, AdminCard, AdminPageHeader, StatusBadge } from "../AdminLayout";
import { api } from "../../api/client";
import { creditOperationsApi, type OperationsStaff } from "../../api/credit-operations";
import { useAppContext } from "../../context/AppContext";
import { getCreditOperationsSelection } from "../../lib/selection";
import { AdminApprovalHistoryScreen as FieldOfficerCaseScreen } from "./CreditOperationsScreens";

interface Props { onNavigate: (screen: string) => void; }
const GREEN = "#0B5E3A";
const BORDER = "#E2E8F0";
const cardButton = { border: `1px solid ${BORDER}`, background: "white", borderRadius: 9, padding: "9px 12px", fontWeight: 700, cursor: "pointer" } as const;
const primary = { ...cardButton, border: "none", background: GREEN, color: "white" } as const;
const input = { width: "100%", minHeight: 96, border: `1px solid ${BORDER}`, borderRadius: 9, padding: 11, boxSizing: "border-box" as const, resize: "vertical" as const };
const ugx = (value: unknown) => `UGX ${Math.round(Number(value || 0)).toLocaleString("en-UG")}`;
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" }) : "—";

function ErrorBox({ value }: { value: string | null }) {
  return value ? <div style={{ padding: 11, borderRadius: 9, background: "#FEF2F2", color: "#991B1B", marginBottom: 12, fontSize: 12 }}>{value}</div> : null;
}

function ReadOnlyEvidence({ token, evidence }: { token: string; evidence: Array<Record<string, any>> }) {
  const [error, setError] = useState<string | null>(null);
  const open = async (id: string) => {
    try {
      const access = await creditOperationsApi.evidenceAccess(token, id);
      window.open(access.url, "_blank", "noopener,noreferrer");
      if (access.revokeAfterUse) window.setTimeout(() => URL.revokeObjectURL(access.url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open evidence.");
    }
  };
  return <AdminCard>
    <h3 style={{ marginTop: 0 }}>Field evidence</h3>
    <p style={{ fontSize: 12, color: "#64748B" }}>Evidence is read-only after Level 1. Return the case if additional evidence is required.</p>
    <ErrorBox value={error} />
    {evidence.length === 0 ? <p style={{ color: "#64748B" }}>No evidence uploaded.</p> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9 }}>
        {evidence.map((item) => <button key={item.id} onClick={() => void open(item.id)} style={{ ...cardButton, textAlign: "left" }}>
          <FileText size={17} color={GREEN} />
          <div style={{ marginTop: 5, fontSize: 12 }}>{String(item.evidence_type || "evidence").replace(/_/g, " ")}</div>
          <div style={{ marginTop: 3, color: "#64748B", fontSize: 10 }}>{Math.round(Number(item.bytes || 0) / 1024)} KB · {when(item.created_at)}</div>
        </button>)}
      </div>
    )}
  </AdminCard>;
}

export function AdminApprovalHistoryReleaseScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const role = state.role;
  const selected = getCreditOperationsSelection();

  // Level 1 keeps the complete field-visit/evidence authoring workspace.
  if (role === "officer") return <FieldOfficerCaseScreen onNavigate={onNavigate} />;

  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [previousStaff, setPreviousStaff] = useState<OperationsStaff[]>([]);
  const [nextStaff, setNextStaff] = useState<OperationsStaff[]>([]);
  const [returnAssignee, setReturnAssignee] = useState("");
  const [nextAssignee, setNextAssignee] = useState("");
  const [narrative, setNarrative] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"internal" | "customer">("internal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applicationId = selected?.applicationId ?? "";
  const load = async () => {
    if (!token || !applicationId) return;
    setError(null);
    try {
      const data = await creditOperationsApi.caseDetail(token, applicationId);
      setDetail(data);
      const level = Number(data.case?.current_level || 0);
      const previousRole = level === 2 ? "officer" : level === 3 ? "manager" : "";
      const nextRole = level === 2 ? "admin" : "";
      const [previous, next] = await Promise.all([
        previousRole ? creditOperationsApi.staff(token, previousRole) : Promise.resolve({ staff: [] }),
        nextRole ? creditOperationsApi.staff(token, nextRole) : Promise.resolve({ staff: [] }),
      ]);
      setPreviousStaff(previous.staff);
      setNextStaff(next.staff);
      if (previous.staff.length === 1) setReturnAssignee(previous.staff[0].id);
      if (next.staff.length === 1) setNextAssignee(next.staff[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the credit case.");
    }
  };
  useEffect(() => { void load(); }, [token, applicationId]);

  if (!applicationId) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Credit Case"><AdminCard>Select an assigned application from your review queue.</AdminCard></AdminLayout>;
  if (!detail) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Credit Case"><ErrorBox value={error}/><AdminCard>Loading assigned credit case…</AdminCard></AdminLayout>;

  const application = detail.application || {};
  const creditCase = detail.case || {};
  const evaluation = detail.evaluations?.[0] || {};
  const level = Number(creditCase.current_level || (role === "manager" ? 2 : 3));
  const messages = (detail.messages || []) as Array<Record<string, any>>;

  const returnCase = async () => {
    if (!token || !returnAssignee || narrative.trim().length < 40) { setError("Select the previous reviewer and write at least 40 characters explaining what must be clarified."); return; }
    setBusy(true); setError(null);
    try {
      await creditOperationsApi.decide(token, applicationId, {
        action: "return",
        narrative: narrative.trim(),
        returnToLevel: level - 1,
        assigneeId: returnAssignee,
      });
      onNavigate("admin-officer-dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not return the case."); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    if (!token || narrative.trim().length < 40) { setError("Write at least 40 characters explaining the rejection decision."); return; }
    setBusy(true); setError(null);
    try {
      await creditOperationsApi.decide(token, applicationId, { action: "reject", narrative: narrative.trim() });
      onNavigate("admin-officer-dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reject the case."); }
    finally { setBusy(false); }
  };

  const escalate = async () => {
    if (!token || level !== 2 || !nextAssignee || narrative.trim().length < 40) { setError("Select the final approver and write a substantive Level 2 recommendation."); return; }
    setBusy(true); setError(null);
    try {
      await creditOperationsApi.submit(token, applicationId, {
        narrative: narrative.trim(),
        nextAssigneeId: nextAssignee,
        recommendedAmount: evaluation.recommended_amount,
        recommendedTermDays: evaluation.recommended_term_days,
      });
      onNavigate("admin-officer-dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit to final approval."); }
    finally { setBusy(false); }
  };

  const finalApprove = async () => {
    if (!token || level !== 3 || narrative.trim().length < 40) { setError("Write a substantive final approval narrative of at least 40 characters."); return; }
    setBusy(true); setError(null);
    try {
      const operational = await creditOperationsApi.decide(token, applicationId, {
        action: "approve",
        narrative: narrative.trim(),
        recommendedAmount: evaluation.recommended_amount,
        recommendedTermDays: evaluation.recommended_term_days,
      });
      if (!operational.canonicalDecisionRequired) throw new Error("Final operational approval did not request canonical underwriting decision.");
      await api.decideApplication(token, applicationId, "approved", narrative.trim());
      onNavigate("admin-officer-dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the final customer offer."); }
    finally { setBusy(false); }
  };

  const postMessage = async () => {
    if (!token || !message.trim()) return;
    try {
      await creditOperationsApi.postMessage(token, applicationId, message.trim(), undefined, channel);
      setMessage("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not post the message."); }
  };

  const facts: Array<[string, string]> = [
    ["Requested", ugx(application.amount)],
    ["Purpose", application.purpose || "—"],
    ["Term", `${application.termDays || "—"} days`],
    ["Credit score", String(application.underwriting?.creditScore ?? "—")],
    ["Underwritten limit", application.underwriting?.approvedLimit ? ugx(application.underwriting.approvedLimit) : "—"],
    ["KYC", application.customer?.kycVerified ? "Verified" : "Not verified"],
  ];

  return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title={`Credit Review · Level ${level}`}>
    <AdminPageHeader
      title={application.applicantName || selected?.applicantName || "Credit application"}
      subtitle={`${applicationId.slice(0, 8)} · Level ${level} assigned review · ${creditCase.status}`}
      action={<button onClick={() => onNavigate("admin-officer-dashboard")} style={cardButton}><ArrowLeft size={14}/> My queue</button>}
    />
    <ErrorBox value={error}/>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14, marginBottom: 14 }}>
      <AdminCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ marginTop: 0 }}>Application</h3><StatusBadge status={application.status}/></div>
        {facts.map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}><span style={{ color: "#64748B" }}>{label}</span><strong>{value}</strong></div>)}
      </AdminCard>
      <AdminCard>
        <h3 style={{ marginTop: 0 }}>Field assessment</h3>
        {[["Business", evaluation.business_name],["Location", evaluation.business_location],["Monthly sales", evaluation.estimated_monthly_sales ? ugx(evaluation.estimated_monthly_sales) : "—"],["Stock", evaluation.estimated_stock_value ? ugx(evaluation.estimated_stock_value) : "—"],["Repayment capacity", evaluation.repayment_capacity],["Risks", evaluation.risks],["Mitigants", evaluation.mitigating_factors],["Officer recommendation", evaluation.recommendation],["Recommended amount", evaluation.recommended_amount ? ugx(evaluation.recommended_amount) : "—"]].map(([label, value]) => <div key={String(label)} style={{ padding: "7px 0", borderBottom: `1px solid ${BORDER}` }}><div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", fontWeight: 800 }}>{label}</div><div style={{ fontSize: 12, marginTop: 3 }}>{String(value || "—")}</div></div>)}
      </AdminCard>
    </div>

    <ReadOnlyEvidence token={token} evidence={detail.evidence || []}/>

    <AdminCard style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={18} color={GREEN}/><h3 style={{ margin: 0 }}>{level === 2 ? "Senior credit recommendation" : "Final credit decision"}</h3></div>
      <p style={{ fontSize: 12, color: "#64748B" }}>Your narrative is permanent. Approval does not move money; the customer must still accept the offer and agreement before provider-settled disbursement.</p>
      <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} style={input} placeholder="Record evidence considered, affordability, risks, mitigants, and your reasoned decision…" />
      <div style={{ display: "grid", gridTemplateColumns: level === 2 ? "1fr 1fr" : "1fr", gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "#475569" }}>Return to previous reviewer
          <select value={returnAssignee} onChange={(e) => setReturnAssignee(e.target.value)} style={{ ...cardButton, display: "block", width: "100%", marginTop: 5 }}>
            <option value="">Select {level === 2 ? "field officer" : "senior reviewer"}…</option>
            {previousStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.fullName} · {staff.activeCases} active</option>)}
          </select>
        </label>
        {level === 2 && <label style={{ fontSize: 12, color: "#475569" }}>Final approver
          <select value={nextAssignee} onChange={(e) => setNextAssignee(e.target.value)} style={{ ...cardButton, display: "block", width: "100%", marginTop: 5 }}>
            <option value="">Select final approver…</option>
            {nextStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.fullName} · {staff.activeCases} active</option>)}
          </select>
        </label>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button disabled={busy} onClick={() => void returnCase()} style={cardButton}>Return for clarification</button>
        <button disabled={busy} onClick={() => void reject()} style={{ ...cardButton, color: "#B91C1C", borderColor: "#FECACA" }}>Reject</button>
        {level === 2 && <button disabled={busy} onClick={() => void escalate()} style={primary}>Recommend & submit to Level 3</button>}
        {level === 3 && <button disabled={busy} onClick={() => void finalApprove()} style={primary}>Final approve & create offer</button>}
      </div>
    </AdminCard>

    <AdminCard style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><MessageSquare size={18} color={GREEN}/><h3 style={{ margin: 0 }}>Application communication</h3></div>
      <div style={{ display: "flex", gap: 7, margin: "10px 0" }}><button style={channel === "internal" ? primary : cardButton} onClick={() => setChannel("internal")}>Internal reviewers</button><button style={channel === "customer" ? primary : cardButton} onClick={() => setChannel("customer")}>Customer-visible</button><button style={cardButton} onClick={() => void load()}><RefreshCw size={13}/> Refresh</button></div>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {messages.filter((item) => item.message_type === channel).map((item) => <div key={item.id} style={{ borderBottom: `1px solid ${BORDER}`, padding: "8px 0" }}><strong style={{ fontSize: 11 }}>{item.sender_name} · {item.sender_role}</strong><div style={{ fontSize: 12, marginTop: 3 }}>{item.content}</div><div style={{ color: "#94A3B8", fontSize: 10 }}>{when(item.created_at)}</div></div>)}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...input, minHeight: 65, marginTop: 10 }} placeholder={channel === "internal" ? "Ask or answer another reviewer…" : "Send a case update to the customer…"}/>
      <button onClick={() => void postMessage()} style={{ ...primary, marginTop: 8 }}>Send message</button>
    </AdminCard>
  </AdminLayout>;
}
