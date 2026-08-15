import React, { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock3, FileSearch, MessageSquare, RefreshCw, Search, Send, ShieldCheck, Upload, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { AdminLayout, AdminCard, AdminPageHeader, StatCard, StatusBadge } from "../AdminLayout";
import { BottomNav } from "../BottomNav";
import { api } from "../../api/client";
import { creditOperationsApi, type OperationsQueueItem, type OperationsStaff } from "../../api/credit-operations";
import { customerCreditThreadApi } from "../../api/customer-credit-thread";
import { useAppContext } from "../../context/AppContext";
import { getCreditOperationsSelection, getCustomer360Id, setCreditOperationsSelection, setCustomer360Id } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }
const GREEN = "#0B5E3A";
const GOLD = "#F2C94C";
const BORDER = "#E2E8F0";

const ugx = (value: unknown) => `UGX ${Math.round(Number(value || 0)).toLocaleString("en-UG")}`;
const fmt = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const rowButton: React.CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, background: "white", borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left", marginBottom: 10 };
const input: React.CSSProperties = { width: "100%", height: 42, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "0 11px", boxSizing: "border-box", outline: "none", fontSize: 13, background: "white" };
const textarea: React.CSSProperties = { width: "100%", minHeight: 92, border: `1px solid ${BORDER}`, borderRadius: 9, padding: 11, boxSizing: "border-box", outline: "none", fontSize: 13, resize: "vertical", background: "white" };
const primary: React.CSSProperties = { border: "none", background: GREEN, color: "white", borderRadius: 9, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const secondary: React.CSSProperties = { border: `1px solid ${BORDER}`, background: "white", color: "#334155", borderRadius: 9, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };

function useToken() {
  return useAppContext().state.session.token;
}

function ErrorBox({ value }: { value: string | null }) {
  if (!value) return null;
  return <div style={{ padding: 12, marginBottom: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 12 }}>{value}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 30, textAlign: "center", color: "#64748B", background: "white", border: `1px solid ${BORDER}`, borderRadius: 12 }}>{children}</div>;
}

function roleLabel(role: string | null) {
  if (role === "officer") return "Level 1 · Field / Credit Officer";
  if (role === "manager") return "Level 2 · Senior Credit Reviewer";
  if (role === "admin") return "Level 3 · Final Credit Authority";
  return "Credit Operations";
}

function selectCase(row: OperationsQueueItem, onNavigate: Props["onNavigate"]) {
  setCreditOperationsSelection({ applicationId: row.id, applicantName: row.applicant_name });
  onNavigate("admin-approval-history");
}

export function AdminOfficerDashboardScreen({ onNavigate }: Props) {
  const token = useToken();
  const role = useAppContext().state.role;
  const [data, setData] = useState<{ level: number; role: string; counts: Record<string, number>; queue: OperationsQueueItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    if (!token) return;
    setLoading(true); setError(null);
    creditOperationsApi.dashboard(token).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [token]);
  const queue = data?.queue ?? [];
  return (
    <AdminLayout activeScreen="admin-officer-dashboard" onNavigate={onNavigate} title="Credit Operations">
      <AdminPageHeader title={roleLabel(role)} subtitle="Only applications assigned to your current review level appear here." action={<div style={{ display: "flex", gap: 8 }}><button style={secondary} onClick={() => onNavigate("admin-officer-contact")}><Search size={14}/> Search</button>{role !== "officer" && <button style={primary} onClick={() => onNavigate("admin-officer-assignment")}>Assign applications</button>}</div>} />
      <ErrorBox value={error} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
        <StatCard label="My Queue" value={String(queue.length)} sub="Current assigned cases" color={GREEN} icon={<FileSearch size={18} color={GREEN}/>} />
        <StatCard label="Field Evaluation" value={String(data?.counts?.field_evaluation ?? 0)} color="#2563EB" icon={<Camera size={18} color="#2563EB"/>} />
        <StatCard label="Review" value={String((data?.counts?.level2_review ?? 0) + (data?.counts?.final_review ?? 0))} color="#7C3AED" icon={<ShieldCheck size={18} color="#7C3AED"/>} />
        <StatCard label="Returned" value={String(data?.counts?.returned_for_clarification ?? 0)} color="#D97706" icon={<RefreshCw size={18} color="#D97706"/>} />
      </div>
      <AdminCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><div><h3 style={{ margin: 0, fontSize: 15 }}>My review queue</h3><p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748B" }}>Oldest assigned cases appear first.</p></div><button onClick={load} style={secondary}><RefreshCw size={13}/> Refresh</button></div>
        {loading ? <Empty>Loading assigned applications…</Empty> : queue.length === 0 ? <Empty>No applications are assigned to you at this level.</Empty> : queue.map((row) => (
          <button key={row.id} style={rowButton} onClick={() => selectCase(row, onNavigate)}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .9fr .8fr auto", gap: 12, alignItems: "center" }}>
              <div><div style={{ fontWeight: 800, color: "#0F172A" }}>{row.applicant_name}</div><div style={{ fontSize: 11, color: "#64748B" }}>{row.id.slice(0, 8)} · {row.phone || "No phone"}</div></div>
              <div><div style={{ fontWeight: 700 }}>{ugx(row.amount)}</div><div style={{ fontSize: 11, color: "#64748B" }}>{row.purpose}</div></div>
              <div><div style={{ fontWeight: 700 }}>Score {row.credit_score ?? "—"}</div><div style={{ fontSize: 11, color: "#64748B" }}>Limit {row.approved_limit ? ugx(row.approved_limit) : "—"}</div></div>
              <div><StatusBadge status={row.status}/><div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{fmt(row.updated_at)}</div></div>
              <span style={{ color: GREEN, fontWeight: 800 }}>Open →</span>
            </div>
          </button>
        ))}
      </AdminCard>
    </AdminLayout>
  );
}

export function AdminOfficerAssignmentScreen({ onNavigate }: Props) {
  const token = useToken();
  const [apps, setApps] = useState<Array<Record<string, any>>>([]);
  const [officers, setOfficers] = useState<OperationsStaff[]>([]);
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!token) return;
    try {
      const [intake, staff] = await Promise.all([creditOperationsApi.intake(token), creditOperationsApi.staff(token, "officer")]);
      setApps(intake.applications); setOfficers(staff.staff);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void load(); }, [token]);
  const assign = async () => {
    if (!token || !selectedApp || !selectedOfficer) return;
    setBusy(true); setError(null);
    try { await creditOperationsApi.assign(token, selectedApp, selectedOfficer, 1); await load(); setSelectedApp(""); setSelectedOfficer(""); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <AdminLayout activeScreen="admin-officer-assignment" onNavigate={onNavigate} title="Application Intake & Assignment">
      <AdminPageHeader title="Assign field evaluations" subtitle="New eligible applications enter Level 1 only after a real officer is assigned." />
      <ErrorBox value={error} />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <AdminCard><h3 style={{ marginTop: 0 }}>Unassigned applications</h3>{apps.length === 0 ? <Empty>No unassigned applications.</Empty> : apps.map((a) => <button key={a.id} onClick={() => setSelectedApp(a.id)} style={{ ...rowButton, borderColor: selectedApp === a.id ? GREEN : BORDER, background: selectedApp === a.id ? "#F0FDF4" : "white" }}><strong>{a.applicant_name}</strong><div style={{ display: "flex", gap: 12, marginTop: 5, fontSize: 12, color: "#64748B" }}><span>{ugx(a.amount)}</span><span>{a.purpose}</span><span>Score {a.credit_score ?? "—"}</span></div></button>)}</AdminCard>
        <AdminCard><h3 style={{ marginTop: 0 }}>Available field officers</h3>{officers.map((o) => <button key={o.id} onClick={() => setSelectedOfficer(o.id)} style={{ ...rowButton, borderColor: selectedOfficer === o.id ? GREEN : BORDER }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><strong>{o.fullName}</strong><div style={{ fontSize: 11, color: "#64748B" }}>{o.email || o.phone || "Officer"}</div></div><span style={{ fontSize: 12, color: o.activeCases < 10 ? GREEN : "#D97706", fontWeight: 700 }}>{o.activeCases} active</span></div></button>)}<button disabled={!selectedApp || !selectedOfficer || busy} onClick={assign} style={{ ...primary, width: "100%", opacity: !selectedApp || !selectedOfficer ? .5 : 1 }}>{busy ? "Assigning…" : "Assign selected application"}</button></AdminCard>
      </div>
    </AdminLayout>
  );
}

function EvaluationForm({ applicationId, initial, onSaved }: { applicationId: string; initial: Record<string, any>; onSaved: () => void }) {
  const token = useToken();
  const [form, setForm] = useState<Record<string, any>>({ ...initial });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setForm((f) => ({ ...f, gpsLatitude: p.coords.latitude, gpsLongitude: p.coords.longitude })), () => setError("Location permission was not granted."), { enableHighAccuracy: true });
  const save = async () => {
    if (!token) return;
    setSaving(true); setError(null);
    try { await creditOperationsApi.saveEvaluation(token, applicationId, form); onSaved(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const fields = [
    ["businessName", "Business name"], ["businessType", "Business type"], ["businessLocation", "Business location"], ["yearsOperating", "Years operating"],
    ["employeeCount", "Employees"], ["estimatedMonthlySales", "Estimated monthly sales (UGX)"], ["estimatedStockValue", "Estimated stock value (UGX)"], ["monthlyOperatingExpenses", "Monthly operating expenses (UGX)"], ["existingBusinessDebt", "Existing business debt (UGX)"], ["recommendedAmount", "Recommended amount (UGX)"], ["recommendedTermDays", "Recommended term (days)"],
  ];
  const narratives = [["businessObservations","Business observations"],["financialObservations","Financial observations"],["characterAssessment","Customer character / conduct"],["repaymentCapacity","Repayment capacity"],["risks","Risks identified"],["mitigatingFactors","Mitigating factors"],["purposeAssessment","Purpose assessment"],["recommendation","Overall recommendation"]];
  return <div><ErrorBox value={error}/><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>{fields.map(([key,label]) => <label key={key} style={{ fontSize: 12, color: "#475569" }}>{label}<input style={{ ...input, marginTop: 5 }} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}/></label>)}</div><div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>{narratives.map(([key,label]) => <label key={key} style={{ fontSize: 12, color: "#475569" }}>{label}<textarea style={{ ...textarea, marginTop: 5 }} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}/></label>)}</div><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button style={secondary} onClick={locate}>Capture GPS</button><button style={primary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save evaluation draft"}</button></div>{form.gpsLatitude && <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>GPS: {Number(form.gpsLatitude).toFixed(6)}, {Number(form.gpsLongitude).toFixed(6)}</div>}</div>;
}

function EvidencePanel({ applicationId, evidence, onUploaded }: { applicationId: string; evidence: Array<Record<string, any>>; onUploaded: () => void }) {
  const token = useToken();
  const [type, setType] = useState("storefront");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
      let gps: { gpsLatitude?: number; gpsLongitude?: number } = {};
      if (navigator.geolocation) gps = await new Promise((resolve) => navigator.geolocation.getCurrentPosition((p) => resolve({ gpsLatitude: p.coords.latitude, gpsLongitude: p.coords.longitude }), () => resolve({}), { enableHighAccuracy: true, timeout: 5000 }));
      await creditOperationsApi.uploadEvidence(token, applicationId, { evidenceType: type, dataUrl, ...gps, capturedAt: new Date().toISOString() });
      onUploaded();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const openEvidence = async (id: string) => { if (!token) return; try { const access = await creditOperationsApi.evidenceAccess(token, id); if (access.url) window.open(access.url, "_blank", "noopener,noreferrer"); } catch (e: any) { setError(e.message); } };
  return <div><ErrorBox value={error}/><div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}><select style={{ ...input, maxWidth: 240 }} value={type} onChange={(e) => setType(e.target.value)}>{["storefront","business_interior","stock","equipment","licence","supplier_invoice","applicant_at_business","other"].map((v) => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select><label style={{ ...primary, display: "inline-flex", alignItems: "center", gap: 7, opacity: busy ? .6 : 1 }}><Upload size={14}/>{busy ? "Uploading…" : "Upload evidence"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }}/></label></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>{evidence.length === 0 ? <Empty>At least two evidence items are required before Level 1 submission.</Empty> : evidence.map((e) => <button key={e.id} onClick={() => openEvidence(e.id)} style={rowButton}><Camera size={18} color={GREEN}/><div style={{ marginTop: 6, fontWeight: 700 }}>{String(e.evidence_type).replaceAll("_"," ")}</div><div style={{ fontSize: 11, color: "#64748B" }}>{Math.round(Number(e.bytes || 0)/1024)} KB · {fmt(e.created_at)}</div>{e.gps_latitude && <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>GPS captured</div>}</button>)}</div></div>;
}

function ThreadPanel({ applicationId, messages, onPosted }: { applicationId: string; messages: Array<Record<string, any>>; onPosted: () => void }) {
  const token = useToken();
  const [content, setContent] = useState("");
  const [channel, setChannel] = useState<"internal"|"customer">("internal");
  const [error, setError] = useState<string | null>(null);
  const post = async () => { if (!token || !content.trim()) return; try { await creditOperationsApi.postMessage(token, applicationId, content.trim(), undefined, channel); setContent(""); onPosted(); } catch (e:any) { setError(e.message); } };
  return <div><ErrorBox value={error}/><div style={{ display: "flex", gap: 8, marginBottom: 10 }}><button style={channel === "internal" ? primary : secondary} onClick={() => setChannel("internal")}>Internal reviewers</button><button style={channel === "customer" ? primary : secondary} onClick={() => setChannel("customer")}>Customer-visible</button></div><div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 12 }}>{messages.filter((m) => m.message_type === channel).map((m) => <div key={m.id} style={{ padding: 11, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8, background: m.sender_role === "admin" ? "#F0FDF4" : "white" }}><div style={{ fontSize: 11, fontWeight: 800 }}>{m.sender_name} · {m.sender_role}</div><div style={{ marginTop: 4, fontSize: 13 }}>{m.content}</div><div style={{ marginTop: 4, fontSize: 10, color: "#94A3B8" }}>{fmt(m.created_at)}</div></div>)}</div><div style={{ display: "flex", gap: 8 }}><textarea style={{ ...textarea, minHeight: 66 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder={channel === "internal" ? "Ask another reviewer a question…" : "Send an application update to the customer…"}/><button style={primary} onClick={post}><Send size={15}/> Send</button></div></div>;
}

export function AdminApprovalHistoryScreen({ onNavigate }: Props) {
  const token = useToken();
  const role = useAppContext().state.role;
  const selected = getCreditOperationsSelection();
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [nextAssignee, setNextAssignee] = useState("");
  const [staff, setStaff] = useState<OperationsStaff[]>([]);
  const load = async () => { if (!token || !selected?.applicationId) return; try { const d = await creditOperationsApi.caseDetail(token, selected.applicationId); setDetail(d); const level = Number(d.case?.current_level || 1); if (level < 3) { const nextRole = level === 1 ? "manager" : "admin"; setStaff((await creditOperationsApi.staff(token, nextRole)).staff); } } catch (e:any) { setError(e.message); } };
  useEffect(() => { void load(); }, [token, selected?.applicationId]);
  if (!selected?.applicationId) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Credit Case"><Empty>Select an application from your queue first.</Empty></AdminLayout>;
  if (!detail) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Credit Case"><ErrorBox value={error}/><Empty>Loading credit case…</Empty></AdminLayout>;
  const application = detail.application || {};
  const c = detail.case || {};
  const latestEvaluation = detail.evaluations?.[0] || {};
  const level = Number(c.current_level || 1);
  const submitNext = async () => { if (!token) return; try { await creditOperationsApi.submit(token, application.id, { narrative, nextAssigneeId: nextAssignee, recommendedAmount: latestEvaluation.recommended_amount, recommendedTermDays: latestEvaluation.recommended_term_days }); setNarrative(""); setNextAssignee(""); await load(); } catch (e:any) { setError(e.message); } };
  const decide = async (action: "return"|"reject"|"approve") => { if (!token) return; try { if (action === "return") { if (!nextAssignee) throw new Error("Select the officer/reviewer receiving the returned case."); await creditOperationsApi.decide(token, application.id, { action, narrative, assigneeId: nextAssignee, returnToLevel: Math.max(1, level - 1) }); } else { const result = await creditOperationsApi.decide(token, application.id, { action, narrative, recommendedAmount: latestEvaluation.recommended_amount, recommendedTermDays: latestEvaluation.recommended_term_days }); if (action === "approve" && result.canonicalDecisionRequired) await api.decideApplication(token, application.id, "approved", narrative); } await load(); } catch (e:any) { setError(e.message); } };
  const tabs = ["overview", ...(level === 1 ? ["evaluation","evidence"] : ["evaluation","evidence"]), "review", "thread", "timeline"];
  return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title={`Credit Case · ${application.applicantName || selected.applicantName || "Applicant"}`}>
    <AdminPageHeader title={application.applicantName || "Credit application"} subtitle={`${application.id?.slice(0,8)} · ${ugx(application.amount)} · ${application.purpose} · ${roleLabel(role)}`} action={<button style={secondary} onClick={() => { setCustomer360Id(application.applicantId); onNavigate("admin-officer-contact"); }}>Open Customer 360°</button>} />
    <ErrorBox value={error}/>
    <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>{tabs.map((t) => <button key={t} style={tab === t ? primary : secondary} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    {tab === "overview" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><AdminCard><h3 style={{ marginTop:0 }}>Application</h3>{[["Requested",ugx(application.amount)],["Purpose",application.purpose],["Term",`${application.termDays} days`],["Status",application.status],["KYC",application.customer?.kycVerified?"Verified":"Not verified"],["Phone",application.customer?.phone||"—"],["District",application.customer?.district||"—"]].map(([k,v]) => <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12 }}><span style={{color:"#64748B"}}>{k}</span><strong>{v}</strong></div>)}</AdminCard><AdminCard><h3 style={{marginTop:0}}>Underwriting</h3>{[["Credit score",application.underwriting?.creditScore??"—"],["Approved limit",application.underwriting?.approvedLimit?ugx(application.underwriting.approvedLimit):"—"],["Disposable income",application.underwriting?.disposableIncome?ugx(application.underwriting.disposableIncome):"—"],["Affordable payment",application.underwriting?.maxAffordablePayment?ugx(application.underwriting.maxAffordablePayment):"—"],["Workflow level",String(level)],["Workflow status",c.status]].map(([k,v]) => <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12 }}><span style={{color:"#64748B"}}>{k}</span><strong>{v}</strong></div>)}</AdminCard></div>}
    {tab === "evaluation" && <AdminCard><h3 style={{marginTop:0}}>Field evaluation</h3>{level === 1 && role === "officer" ? <EvaluationForm applicationId={application.id} initial={{ businessName: latestEvaluation.business_name, businessType: latestEvaluation.business_type, businessLocation: latestEvaluation.business_location, yearsOperating: latestEvaluation.years_operating, employeeCount: latestEvaluation.employee_count, estimatedMonthlySales: latestEvaluation.estimated_monthly_sales, estimatedStockValue: latestEvaluation.estimated_stock_value, monthlyOperatingExpenses: latestEvaluation.monthly_operating_expenses, existingBusinessDebt: latestEvaluation.existing_business_debt, businessObservations: latestEvaluation.business_observations, financialObservations: latestEvaluation.financial_observations, characterAssessment: latestEvaluation.character_assessment, repaymentCapacity: latestEvaluation.repayment_capacity, risks: latestEvaluation.risks, mitigatingFactors: latestEvaluation.mitigating_factors, purposeAssessment: latestEvaluation.purpose_assessment, recommendation: latestEvaluation.recommendation, recommendedAmount: latestEvaluation.recommended_amount, recommendedTermDays: latestEvaluation.recommended_term_days, gpsLatitude: latestEvaluation.gps_latitude, gpsLongitude: latestEvaluation.gps_longitude }} onSaved={load}/> : <div>{Object.keys(latestEvaluation).length === 0 ? <Empty>No field evaluation has been submitted.</Empty> : [["Business",latestEvaluation.business_name],["Location",latestEvaluation.business_location],["Monthly sales",latestEvaluation.estimated_monthly_sales?ugx(latestEvaluation.estimated_monthly_sales):"—"],["Stock value",latestEvaluation.estimated_stock_value?ugx(latestEvaluation.estimated_stock_value):"—"],["Business observations",latestEvaluation.business_observations],["Financial observations",latestEvaluation.financial_observations],["Character",latestEvaluation.character_assessment],["Repayment capacity",latestEvaluation.repayment_capacity],["Risks",latestEvaluation.risks],["Mitigants",latestEvaluation.mitigating_factors],["Recommendation",latestEvaluation.recommendation],["Recommended amount",latestEvaluation.recommended_amount?ugx(latestEvaluation.recommended_amount):"—"]].map(([k,v]) => <div key={k} style={{padding:"9px 0",borderBottom:`1px solid ${BORDER}`}}><div style={{fontSize:10,textTransform:"uppercase",fontWeight:800,color:"#94A3B8"}}>{k}</div><div style={{fontSize:13,marginTop:3}}>{v||"—"}</div></div>)}</div>}</AdminCard>}
    {tab === "evidence" && <AdminCard><h3 style={{marginTop:0}}>Business evidence</h3>{level === 1 && role === "officer" ? <EvidencePanel applicationId={application.id} evidence={detail.evidence||[]} onUploaded={load}/> : <EvidencePanel applicationId={application.id} evidence={detail.evidence||[]} onUploaded={load}/>}</AdminCard>}
    {tab === "review" && <AdminCard><h3 style={{marginTop:0}}>{level === 1 ? "Submit field evaluation" : level === 2 ? "Senior credit review" : "Final credit decision"}</h3><p style={{fontSize:12,color:"#64748B"}}>Your narrative is permanent and remains visible in the application audit trail.</p><textarea style={textarea} value={narrative} onChange={(e)=>setNarrative(e.target.value)} placeholder="Explain your assessment, evidence considered, risks, mitigants, and recommendation…"/>{level < 3 && <div style={{marginTop:10}}><label style={{fontSize:12,color:"#475569"}}>Next approver<select style={{...input,marginTop:5}} value={nextAssignee} onChange={(e)=>setNextAssignee(e.target.value)}><option value="">Select next approver…</option>{staff.map((s)=><option key={s.id} value={s.id}>{s.fullName} · {s.activeCases} active</option>)}</select></label><button style={{...primary,marginTop:10}} onClick={submitNext}>Submit to Level {level+1}</button></div>}{level > 1 && <div style={{display:"flex",gap:8,marginTop:12}}><button style={secondary} onClick={()=>decide("return")}>Return for clarification</button><button style={{...secondary,color:"#B91C1C",borderColor:"#FECACA"}} onClick={()=>decide("reject")}>Reject</button>{level===3&&<button style={primary} onClick={()=>decide("approve")}>Final approve & create offer</button>}</div>}</AdminCard>}
    {tab === "thread" && <AdminCard><h3 style={{marginTop:0}}>Application communication</h3><ThreadPanel applicationId={application.id} messages={detail.messages||[]} onPosted={load}/></AdminCard>}
    {tab === "timeline" && <AdminCard><h3 style={{marginTop:0}}>Permanent workflow history</h3>{(detail.events||[]).length===0?<Empty>No workflow events yet.</Empty>:(detail.events||[]).map((e:any)=><div key={e.id} style={{display:"grid",gridTemplateColumns:"150px 1fr",gap:12,padding:"10px 0",borderBottom:`1px solid ${BORDER}`}}><div style={{fontSize:11,color:"#64748B"}}>{fmt(e.created_at)}</div><div><strong style={{fontSize:12}}>{e.event_type}</strong><div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.actor_name||"System"}{e.from_level?` · L${e.from_level}${e.to_level?` → L${e.to_level}`:""}`:""}</div></div></div>)}</AdminCard>}
  </AdminLayout>;
}

export function AdminOfficerContactScreen({ onNavigate }: Props) {
  const token = useToken();
  const [q,setQ]=useState(""); const [results,setResults]=useState<any>(null); const [profile,setProfile]=useState<any>(null); const [error,setError]=useState<string|null>(null);
  const selectedId=getCustomer360Id();
  const loadProfile=async(id:string)=>{if(!token)return;try{setProfile(await creditOperationsApi.customer360(token,id));setCustomer360Id(id);}catch(e:any){setError(e.message)}};
  useEffect(()=>{if(selectedId)void loadProfile(selectedId)},[token,selectedId]);
  const search=async()=>{if(!token||q.trim().length<2)return;try{setResults(await creditOperationsApi.search(token,q.trim()));setProfile(null)}catch(e:any){setError(e.message)}};
  return <AdminLayout activeScreen="admin-officer-contact" onNavigate={onNavigate} title="Search & Customer 360°"><AdminPageHeader title="Search applicants and customers" subtitle="Search by customer, phone, NIN, application, loan, business or purpose."/><ErrorBox value={error}/><div style={{display:"flex",gap:8,marginBottom:16}}><input style={input} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void search()}} placeholder="Search Kuula…"/><button style={primary} onClick={search}><Search size={14}/> Search</button></div>{profile?<Customer360 profile={profile} onOpenApplication={(a:any)=>{setCreditOperationsSelection({applicationId:a.id,applicantName:profile.customer.fullName,customerId:profile.customer.id});onNavigate("admin-approval-history")}}/>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><AdminCard><h3 style={{marginTop:0}}>Customers</h3>{(results?.customers||[]).map((c:any)=><button key={c.id} style={rowButton} onClick={()=>loadProfile(c.id)}><strong>{c.full_name}</strong><div style={{fontSize:11,color:"#64748B"}}>{c.phone||"—"} · {c.district||"—"}</div></button>)}</AdminCard><AdminCard><h3 style={{marginTop:0}}>Applications & businesses</h3>{(results?.applications||[]).map((a:any)=><button key={a.id} style={rowButton} onClick={()=>{setCreditOperationsSelection({applicationId:a.id,applicantName:a.applicant_name,customerId:a.applicant_id});onNavigate("admin-approval-history")}}><strong>{a.applicant_name}</strong><div style={{fontSize:11,color:"#64748B"}}>{a.id.slice(0,8)} · {ugx(a.amount)} · {a.status}</div></button>)}{(results?.businesses||[]).map((b:any)=><button key={b.application_id} style={rowButton} onClick={()=>{setCreditOperationsSelection({applicationId:b.application_id,applicantName:b.applicant_name,customerId:b.applicant_id});onNavigate("admin-approval-history")}}><strong>{b.business_name||"Business"}</strong><div style={{fontSize:11,color:"#64748B"}}>{b.applicant_name} · {b.business_location||"—"}</div></button>)}</AdminCard></div>}</AdminLayout>;
}

function Customer360({profile,onOpenApplication}:{profile:any;onOpenApplication:(a:any)=>void}){const c=profile.customer||{};return <div><div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginBottom:14}}><StatCard label="Facilities" value={String(profile.applications?.length||0)} color={GREEN} icon={<FileSearch size={18} color={GREEN}/>}/><StatCard label="Repaid" value={String(c.loansRepaid||0)} color="#2563EB" icon={<CheckCircle2 size={18} color="#2563EB"/>}/><StatCard label="KYC" value={c.kycVerified?"Verified":"Pending"} color={c.kycVerified?GREEN:"#D97706"} icon={<ShieldCheck size={18} color={GREEN}/>}/><StatCard label="Joined" value={c.createdAt?new Date(c.createdAt).toLocaleDateString("en-UG",{month:"short",year:"numeric"}):"—"} color="#7C3AED" icon={<Clock3 size={18} color="#7C3AED"/>}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:14}}><AdminCard><h3 style={{marginTop:0}}>{c.fullName}</h3>{[["Phone",c.phone],["Email",c.email],["NIN",c.nationalId],["District",c.district],["Occupation",c.occupation],["Phone verified",c.phoneVerified?"Yes":"No"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12}}><span style={{color:"#64748B"}}>{k}</span><strong>{v||"—"}</strong></div>)}</AdminCard><AdminCard><h3 style={{marginTop:0}}>Credit relationship</h3>{(profile.applications||[]).map((a:any)=><button key={a.id} style={rowButton} onClick={()=>onOpenApplication(a)}><div style={{display:"flex",justifyContent:"space-between"}}><strong>{a.purpose}</strong><StatusBadge status={a.status}/></div><div style={{fontSize:12,color:"#64748B",marginTop:5}}>{ugx(a.amount)} · Score {a.creditScore??"—"} · {fmt(a.createdAt)}</div></button>)}</AdminCard></div><AdminCard style={{marginTop:14}}><h3 style={{marginTop:0}}>Audit & communication history</h3><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><div>{(profile.cases||[]).slice(0,20).map((x:any)=><div key={x.application_id} style={{padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12}}>Case {String(x.application_id).slice(0,8)} · L{x.current_level} · {x.status}</div>)}</div><div>{(profile.applicationMessages||[]).slice(0,20).map((m:any)=><div key={`${m.application_id}-${m.created_at}`} style={{padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12}}><strong>{m.sender_name}</strong>: {m.content}</div>)}</div></div></AdminCard></div>}

export function AdminApprovalWorkflowScreen({onNavigate}:Props){return <AdminOfficerDashboardScreen onNavigate={onNavigate}/>}
export function AdminApprovalLevelsScreen({onNavigate}:Props){return <AdminLayout activeScreen="admin-approval-levels" onNavigate={onNavigate} title="Approval Levels"><AdminPageHeader title="Three-level credit approval" subtitle="Level 1 field evaluation → Level 2 senior review → Level 3 final credit authority."/><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>{[["1","Field / Credit Officer","Business visit, evidence, narrative, recommendation"],["2","Senior Credit Reviewer","Independent review, questions, return/recommend"],["3","Final Credit Authority","Final approval/rejection before canonical offer"]].map(([n,t,d])=><AdminCard key={n}><div style={{width:38,height:38,borderRadius:20,background:GREEN,color:"white",display:"grid",placeItems:"center",fontWeight:800}}>{n}</div><h3>{t}</h3><p style={{fontSize:12,color:"#64748B"}}>{d}</p></AdminCard>)}</div></AdminLayout>}
export function AdminPendingByOfficerScreen({onNavigate}:Props){return <AdminOfficerDashboardScreen onNavigate={onNavigate}/>}
export function AdminLoanEscalationScreen({onNavigate}:Props){return <AdminApprovalHistoryScreen onNavigate={onNavigate}/>}
export function AdminTransferLoanScreen({onNavigate}:Props){return <AdminOfficerAssignmentScreen onNavigate={onNavigate}/>}
export function AdminApprovalTimeTrackingScreen({onNavigate}:Props){return <AdminOfficerDashboardScreen onNavigate={onNavigate}/>}
export function AdminOfficerPerformanceScreen({onNavigate}:Props){return <AdminOfficerDashboardScreen onNavigate={onNavigate}/>}
export function AdminOfficerAvailabilityScreen({onNavigate}:Props){return <AdminOfficerAssignmentScreen onNavigate={onNavigate}/>}
export function AdminAutoApproveSettingsScreen({onNavigate}:Props){return <AdminLayout activeScreen="admin-auto-approve-settings" onNavigate={onNavigate} title="Approval Safety"><AdminPageHeader title="Manual approval chain enforced" subtitle="Automatic approval is not enabled in the three-level operational workflow."/><Empty>Kuula requires human field evaluation and staged review before the canonical offer step.</Empty></AdminLayout>}
export function AdminFollowupReminderScreen({onNavigate}:Props){return <AdminApprovalHistoryScreen onNavigate={onNavigate}/>}
export function AdminFollowupStatusScreen({onNavigate}:Props){return <AdminApprovalHistoryScreen onNavigate={onNavigate}/>}
export function AdminFollowupHistoryScreen({onNavigate}:Props){return <AdminApprovalHistoryScreen onNavigate={onNavigate}/>}

export function CustomerOfficerAssignedScreen({onNavigate}:Props){const token=useToken();const [apps,setApps]=useState<any[]>([]);const [messages,setMessages]=useState<any[]>([]);const [content,setContent]=useState("");const current=useMemo(()=>apps.find(a=>["pending","resubmitted","offered","disbursing","active"].includes(a.status))||apps[0],[apps]);useEffect(()=>{if(!token)return;api.getApplications(token).then(r=>setApps(r.applications)).catch(()=>{})},[token]);useEffect(()=>{if(!token||!current?.id)return;customerCreditThreadApi.list(token,current.id).then(r=>setMessages(r.messages)).catch(()=>{})},[token,current?.id]);const post=async()=>{if(!token||!current?.id||!content.trim())return;await customerCreditThreadApi.post(token,current.id,content.trim());setContent("");setMessages((await customerCreditThreadApi.list(token,current.id)).messages)};return <div style={{minHeight:"100%",background:"#F8FAF9",padding:"20px 16px 90px"}}><h1 style={{fontSize:22,color:"#062D1C"}}>Your credit application</h1>{!current?<Empty>No active application.</Empty>:<><div style={{background:"white",border:`1px solid ${BORDER}`,borderRadius:14,padding:16,marginBottom:14}}><strong>{current.purpose}</strong><div style={{fontSize:13,color:"#64748B",marginTop:5}}>{ugx(current.amount)} · {current.status}</div><p style={{fontSize:12,color:"#64748B"}}>Your application may move through field evaluation, senior review and final approval. Kuula will contact you if clarification is needed.</p></div><div style={{background:"white",border:`1px solid ${BORDER}`,borderRadius:14,padding:16}}><h3 style={{marginTop:0}}>Application messages</h3>{messages.map(m=><div key={m.id} style={{padding:"9px 0",borderBottom:`1px solid ${BORDER}`}}><strong style={{fontSize:11}}>{m.sender_role==="user"||m.sender_role==="customer"?"You":"Kuula"}</strong><div style={{fontSize:13,marginTop:3}}>{m.content}</div><div style={{fontSize:10,color:"#94A3B8"}}>{fmt(m.created_at)}</div></div>)}<textarea style={{...textarea,marginTop:12}} value={content} onChange={e=>setContent(e.target.value)} placeholder="Reply about this application…"/><button style={{...primary,marginTop:8}} onClick={post}>Send message</button></div></>}<BottomNav active="more" onNavigate={onNavigate}/></div>}
export function CustomerLoanTimelineScreen({onNavigate}:Props){return <CustomerOfficerAssignedScreen onNavigate={onNavigate}/>}
