import { useEffect, useState } from "react";
import { Camera, RefreshCw, Send, Upload } from "lucide-react";
import { AdminLayout, AdminCard, AdminPageHeader } from "../AdminLayout";
import { creditOperationsApi, type OperationsStaff } from "../../api/credit-operations";
import { useAppContext } from "../../context/AppContext";
import { getCreditOperationsSelection, setCustomer360Id } from "../../lib/selection";
import { CreditCaseSummaryPanel } from "./CreditCaseSummaryPanel";

interface Props { onNavigate: (screen: string) => void; }
const GREEN = "#0B5E3A";
const BORDER = "#E2E8F0";
const button = { border: `1px solid ${BORDER}`, background: "white", borderRadius: 9, padding: "9px 12px", fontWeight: 700, cursor: "pointer" } as const;
const primary = { ...button, border: "none", background: GREEN, color: "white" } as const;
const input = { width: "100%", height: 42, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "0 11px", boxSizing: "border-box" as const, outline: "none", fontSize: 13, background: "white" };
const textarea = { width: "100%", minHeight: 92, border: `1px solid ${BORDER}`, borderRadius: 9, padding: 11, boxSizing: "border-box" as const, outline: "none", fontSize: 13, resize: "vertical" as const, background: "white" };
const fmt = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const ugx = (value: unknown) => `UGX ${Math.round(Number(value || 0)).toLocaleString("en-UG")}`;

function ErrorBox({ value }: { value: string | null }) {
  return value ? <div style={{ padding: 11, borderRadius: 9, background: "#FEF2F2", color: "#991B1B", marginBottom: 12, fontSize: 12 }}>{value}</div> : null;
}

export function FieldOfficerCaseEnhancedScreen({ onNavigate }: Props) {
  const token = useAppContext().state.session.token;
  const selected = getCreditOperationsSelection();
  const applicationId = selected?.applicationId || "";
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState("overview");
  const [managers, setManagers] = useState<OperationsStaff[]>([]);
  const [nextAssignee, setNextAssignee] = useState("");
  const [narrative, setNarrative] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"internal" | "customer">("internal");
  const [form, setForm] = useState<Record<string, any>>({});
  const [evidenceType, setEvidenceType] = useState("storefront");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token || !applicationId) return;
    setError(null);
    try {
      const [caseData, staff] = await Promise.all([
        creditOperationsApi.caseDetail(token, applicationId),
        creditOperationsApi.staff(token, "manager"),
      ]);
      setDetail(caseData);
      setManagers(staff.staff);
      if (staff.staff.length === 1) setNextAssignee(staff.staff[0].id);
      const ev = caseData.evaluations?.[0] || {};
      setForm({
        businessName: ev.business_name || "",
        businessType: ev.business_type || "",
        businessLocation: ev.business_location || "",
        yearsOperating: ev.years_operating ?? "",
        employeeCount: ev.employee_count ?? "",
        estimatedMonthlySales: ev.estimated_monthly_sales ?? "",
        estimatedStockValue: ev.estimated_stock_value ?? "",
        monthlyOperatingExpenses: ev.monthly_operating_expenses ?? "",
        existingBusinessDebt: ev.existing_business_debt ?? "",
        businessObservations: ev.business_observations || "",
        financialObservations: ev.financial_observations || "",
        characterAssessment: ev.character_assessment || "",
        repaymentCapacity: ev.repayment_capacity || "",
        risks: ev.risks || "",
        mitigatingFactors: ev.mitigating_factors || "",
        purposeAssessment: ev.purpose_assessment || "",
        recommendation: ev.recommendation || "",
        recommendedAmount: ev.recommended_amount ?? "",
        recommendedTermDays: ev.recommended_term_days ?? "",
        gpsLatitude: ev.gps_latitude ?? "",
        gpsLongitude: ev.gps_longitude ?? "",
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the assigned credit case."); }
  };
  useEffect(() => { void load(); }, [token, applicationId]);

  if (!applicationId) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Field Evaluation"><AdminCard>Select an assigned application from your queue.</AdminCard></AdminLayout>;
  if (!detail) return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Field Evaluation"><ErrorBox value={error}/><AdminCard>Loading assigned application…</AdminCard></AdminLayout>;

  const application = detail.application || {};
  const evidence = (detail.evidence || []) as Array<Record<string, any>>;
  const messages = (detail.messages || []) as Array<Record<string, any>>;
  const events = (detail.events || []) as Array<Record<string, any>>;
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const saveEvaluation = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try { await creditOperationsApi.saveEvaluation(token, applicationId, form); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the evaluation."); }
    finally { setBusy(false); }
  };

  const captureGps = () => navigator.geolocation?.getCurrentPosition(
    (position) => setForm((current) => ({ ...current, gpsLatitude: position.coords.latitude, gpsLongitude: position.coords.longitude })),
    () => setError("Location permission was not granted."),
    { enableHighAccuracy: true },
  );

  const uploadEvidence = async (file: File) => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await creditOperationsApi.uploadEvidence(token, applicationId, { evidenceType, dataUrl, gpsLatitude: form.gpsLatitude || undefined, gpsLongitude: form.gpsLongitude || undefined, capturedAt: new Date().toISOString() });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload evidence."); }
    finally { setBusy(false); }
  };

  const openEvidence = async (id: string) => {
    if (!token) return;
    try { const access = await creditOperationsApi.evidenceAccess(token, id); window.open(access.url, "_blank", "noopener,noreferrer"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open evidence."); }
  };

  const submitToManager = async () => {
    if (!token) return;
    if (narrative.trim().length < 40) { setError("Write at least 40 characters explaining the evidence, risks and recommendation."); return; }
    if (!nextAssignee) { setError("Select the Level 2 reviewer."); return; }
    setBusy(true); setError(null);
    try {
      await creditOperationsApi.submit(token, applicationId, { narrative: narrative.trim(), nextAssigneeId: nextAssignee, recommendedAmount: form.recommendedAmount, recommendedTermDays: form.recommendedTermDays });
      onNavigate("admin-officer-dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit the case to Level 2."); }
    finally { setBusy(false); }
  };

  const postMessage = async () => {
    if (!token || !message.trim()) return;
    try { await creditOperationsApi.postMessage(token, applicationId, message.trim(), undefined, channel); setMessage(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not post the message."); }
  };

  const tabs = ["overview", "evaluation", "evidence", "review", "thread", "timeline"];
  const fieldInputs = [["businessName","Business name"],["businessType","Business type"],["businessLocation","Business location"],["yearsOperating","Years operating"],["employeeCount","Employees"],["estimatedMonthlySales","Estimated monthly sales (UGX)"],["estimatedStockValue","Estimated stock value (UGX)"],["monthlyOperatingExpenses","Monthly operating expenses (UGX)"],["existingBusinessDebt","Existing business debt (UGX)"],["recommendedAmount","Recommended amount (UGX)"],["recommendedTermDays","Recommended term (days)"]];
  const narratives = [["businessObservations","Business observations"],["financialObservations","Financial observations"],["characterAssessment","Customer character / conduct"],["repaymentCapacity","Repayment capacity"],["risks","Risks identified"],["mitigatingFactors","Mitigating factors"],["purposeAssessment","Purpose assessment"],["recommendation","Overall recommendation"]];

  return <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Level 1 · Field / Credit Officer">
    <AdminPageHeader title={application.applicantName || selected?.applicantName || "Credit application"} subtitle={`${applicationId.slice(0, 8)} · ${ugx(application.amount)} · ${application.purpose}`} action={<div style={{ display: "flex", gap: 8 }}><button style={button} onClick={() => { setCustomer360Id(application.applicantId); onNavigate("admin-officer-contact"); }}>Customer 360°</button><button style={button} onClick={() => onNavigate("admin-officer-dashboard")}>My queue</button></div>}/>
    <ErrorBox value={error}/>
    <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>{tabs.map((item) => <button key={item} style={tab === item ? primary : button} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>

    {tab === "overview" && <><CreditCaseSummaryPanel detail={detail}/><AdminCard><h3 style={{ marginTop: 0 }}>Customer & application</h3>{[["Phone",application.customer?.phone],["District",application.customer?.district],["Existing occupation",application.customer?.occupation],["KYC",application.customer?.kycVerified?"Verified":"Not verified"],["Purpose",application.purpose],["Term",`${application.termDays} days`],["Status",application.status]].map(([label,value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}><span style={{ color: "#64748B" }}>{label}</span><strong>{value || "—"}</strong></div>)}</AdminCard></>}

    {tab === "evaluation" && <AdminCard><h3 style={{ marginTop: 0 }}>Field evaluation</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>{fieldInputs.map(([key,label]) => <label key={key} style={{ fontSize: 12, color: "#475569" }}>{label}<input style={{ ...input, marginTop: 5 }} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}/></label>)}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 12 }}>{narratives.map(([key,label]) => <label key={key} style={{ fontSize: 12, color: "#475569" }}>{label}<textarea style={{ ...textarea, marginTop: 5 }} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}/></label>)}</div><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button style={button} onClick={captureGps}>Capture GPS</button><button style={primary} disabled={busy} onClick={() => void saveEvaluation()}>{busy ? "Saving…" : "Save evaluation draft"}</button></div>{form.gpsLatitude && <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>GPS: {Number(form.gpsLatitude).toFixed(6)}, {Number(form.gpsLongitude).toFixed(6)}</div>}</AdminCard>}

    {tab === "evidence" && <AdminCard><h3 style={{ marginTop: 0 }}>Supporting evidence</h3><p style={{ fontSize: 12, color: "#64748B" }}>Upload only evidence relevant to the application. At least two field evidence items are required before Level 1 submission.</p><div style={{ display: "flex", gap: 8, marginBottom: 12 }}><select style={{ ...input, maxWidth: 250 }} value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>{["storefront","business_interior","stock","equipment","licence","supplier_invoice","applicant_at_business","other"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><label style={{ ...primary, display: "inline-flex", gap: 7, alignItems: "center" }}><Upload size={14}/>{busy ? "Uploading…" : "Upload evidence"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(e) => { const file=e.target.files?.[0]; if(file) void uploadEvidence(file); e.currentTarget.value=""; }}/></label></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9 }}>{evidence.map((item) => <button key={item.id} style={{ ...button, textAlign: "left" }} onClick={() => void openEvidence(String(item.id))}><Camera size={16} color={GREEN}/><div style={{ marginTop: 5, fontSize: 12, fontWeight: 700 }}>{String(item.evidence_type).replaceAll("_", " ")}</div><div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>{Math.round(Number(item.bytes || 0)/1024)} KB · {fmt(item.created_at)}</div></button>)}</div></AdminCard>}

    {tab === "review" && <AdminCard><h3 style={{ marginTop: 0 }}>Officer recommendation & escalation</h3><p style={{ fontSize: 12, color: "#64748B" }}>Your narrative becomes part of the permanent credit audit trail. The manager and final approver will see the system underwriting separately from your judgement.</p><textarea style={textarea} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Explain evidence considered, affordability, risks, mitigants and why you recommend the amount/term…"/><label style={{ display: "block", fontSize: 12, color: "#475569", marginTop: 10 }}>Level 2 reviewer<select style={{ ...input, marginTop: 5 }} value={nextAssignee} onChange={(e) => setNextAssignee(e.target.value)}><option value="">Select Level 2 reviewer…</option>{managers.map((staff) => <option key={staff.id} value={staff.id}>{staff.fullName} · {staff.activeCases} active</option>)}</select></label><button style={{ ...primary, marginTop: 10 }} disabled={busy} onClick={() => void submitToManager()}>{busy ? "Submitting…" : "Submit to Level 2"}</button></AdminCard>}

    {tab === "thread" && <AdminCard><h3 style={{ marginTop: 0 }}>Application communication</h3><div style={{ display: "flex", gap: 7, marginBottom: 10 }}><button style={channel === "internal" ? primary : button} onClick={() => setChannel("internal")}>Internal reviewers</button><button style={channel === "customer" ? primary : button} onClick={() => setChannel("customer")}>Customer-visible</button><button style={button} onClick={() => void load()}><RefreshCw size={13}/> Refresh</button></div><div style={{ maxHeight: 280, overflowY: "auto" }}>{messages.filter((item) => item.message_type === channel).map((item) => <div key={item.id} style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}><strong style={{ fontSize: 11 }}>{item.sender_name} · {item.sender_role}</strong><div style={{ fontSize: 12, marginTop: 3 }}>{item.content}</div><div style={{ color: "#94A3B8", fontSize: 10 }}>{fmt(item.created_at)}</div></div>)}</div><textarea style={{ ...textarea, minHeight: 64, marginTop: 10 }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={channel === "internal" ? "Message another reviewer…" : "Send an update to the customer…"}/><button style={{ ...primary, marginTop: 8 }} onClick={() => void postMessage()}><Send size={14}/> Send</button></AdminCard>}

    {tab === "timeline" && <AdminCard><h3 style={{ marginTop: 0 }}>Permanent workflow history</h3>{events.map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}><div style={{ fontSize: 11, color: "#64748B" }}>{fmt(item.created_at)}</div><div><strong style={{ fontSize: 12 }}>{item.event_type}</strong><div style={{ fontSize: 11, color: "#64748B" }}>{item.actor_name || "System"}</div></div></div>)}</AdminCard>}
  </AdminLayout>;
}
