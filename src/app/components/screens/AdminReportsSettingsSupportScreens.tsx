/**
 * A8.1-A8.5 Reports | A9.1-A9.10 Settings | A10.1-A10.4 Support
 */

import React, { useState, useEffect } from "react";
import { Download, Send, Plus, Trash2, Check } from "lucide-react";
import { AdminLayout, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { InvestorReport } from "../../api/supabase-service";
import { formatUGX, downloadPdf } from "../../lib/export";
import { exportInvestorReportPdf, exportInvestorReportExcel, exportInvestorReportCsv } from "../../lib/investorReport";

interface Props { onNavigate: (s: string) => void; }

// Shared loader for the live investor report (all figures computed from Postgres).
function useInvestorReport() {
  const { state } = useAppContext();
  const token = state.session.token;
  const [report, setReport] = useState<InvestorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getInvestorReport(token)
      .then((r) => setReport(r))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);
  return { report, loading, error };
}

// A8.1
export function AdminReportsDashboardScreen({ onNavigate }: Props) {
  const { report, loading, error } = useInvestorReport();
  const chart = (report?.monthly ?? []).map((m) => ({ m: m.month, disbursed: Math.round(m.disbursed / 1_000_000), collected: Math.round(m.collected / 1_000_000) }));
  return (
    <AdminLayout activeScreen="admin-reports" onNavigate={onNavigate} title="Financial Reports">
      <AdminPageHeader title="Financial Reports Dashboard" subtitle="Live financial performance from Kuula's ledger"
        action={<div style={{ display:"flex",gap:8 }}>
          {["Daily","Weekly","Monthly","Export"].map((l,i)=>(
            <button key={l} onClick={()=>onNavigate(["admin-daily-report","admin-weekly-report","admin-monthly-report","admin-export-report"][i])} style={{ padding:"7px 14px",borderRadius:8,background:i===2?"#0D5C3A":"white",color:i===2?"white":"#374151",border:"1px solid #E2E8F0",fontSize:12,fontWeight:600,cursor:"pointer" }}>{l}</button>
          ))}
        </div>}
      />
      {loading ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Loading live figures…</div>
      ) : error || !report ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Reports are unavailable right now.</div>
      ) : (
      <>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Collected" value={formatUGX(report.revenue.totalCollected)} color="#10B981" icon={<></>}/>
        <StatCard label="Principal Disbursed" value={formatUGX(report.loans.disbursedPrincipal)} color="#0D5C3A" icon={<></>}/>
        <StatCard label="Realized Interest" value={formatUGX(report.revenue.realizedInterest)} color="#8B5CF6" icon={<></>}/>
        <StatCard label="Default Rate" value={`${report.ratios.defaultRatePct}%`} color="#EF4444" icon={<></>}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Monthly Disbursed vs Collected (UGX Millions)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
              <XAxis dataKey="m" tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ borderRadius:8,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,.1)" }}/>
              <Bar key="disbursed" dataKey="disbursed" fill="#0D5C3A" radius={[4,4,0,0]} name="Disbursed (M)"/>
              <Bar key="collected" dataKey="collected" fill="#10B981" radius={[4,4,0,0]} name="Collected (M)"/>
            </BarChart>
          </ResponsiveContainer>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 14px" }}>Performance Ratios</h3>
          {[["Repayment Rate",`${report.ratios.repaymentRatePct}%`,"#10B981"],["Default Rate",`${report.ratios.defaultRatePct}%`,"#EF4444"],["Portfolio at Risk",`${report.ratios.parPct}%`,"#F59E0B"]].map(([l,v,c])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span>
              <span style={{ fontSize:13,fontWeight:800,color:c as string }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
      </>
      )}
    </AdminLayout>
  );
}

// A8.2
export function AdminDailyReportScreen({ onNavigate }: Props) {
  const { report, loading, error } = useInvestorReport();
  const t = report?.today;
  const dateLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const exportPdf = () => {
    if (!t) return;
    downloadPdf({
      title: "Daily Report",
      subtitle: dateLabel,
      tables: [{ title: "Today's Activity", head: ["Metric", "Value"], rows: [
        ["Applications received", String(t.applications)],
        ["Approved", String(t.approved)],
        ["Rejected", String(t.rejected)],
        ["Amount disbursed", formatUGX(t.disbursed)],
        ["Repayments collected", formatUGX(t.collected)],
      ] }],
    });
  };

  return (
    <AdminLayout activeScreen="admin-daily-report" onNavigate={onNavigate} title="Daily Report">
      <AdminPageHeader title={`Daily Report — ${dateLabel}`} subtitle="Today's operational summary"
        action={<button onClick={exportPdf} disabled={!t} style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:t?"pointer":"default",opacity:t?1:0.6,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export PDF</button>}
      />
      {loading ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Loading today's figures…</div>
      ) : error || !t ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Today's report is unavailable right now.</div>
      ) : (
      <>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Applications Today" value={String(t.applications)} color="#F59E0B" icon={<></>}/>
        <StatCard label="Approved Today" value={String(t.approved)} color="#10B981" icon={<></>}/>
        <StatCard label="Amount Disbursed" value={formatUGX(t.disbursed)} color="#0D5C3A" icon={<></>}/>
        <StatCard label="Repayments Collected" value={formatUGX(t.collected)} color="#8B5CF6" icon={<></>}/>
      </div>
      <AdminCard>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Today's Loan Decisions</h3>
        {[["Applications Received",String(t.applications)],["Approved",String(t.approved)],["Rejected",String(t.rejected)],["Amount Disbursed",formatUGX(t.disbursed)],["Repayments Collected",formatUGX(t.collected)]].map(([l,v])=>(
          <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
            <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#0F172A" }}>{v}</span>
          </div>
        ))}
      </AdminCard>
      </>
      )}
    </AdminLayout>
  );
}

// A8.3
export function AdminWeeklyReportScreen({ onNavigate }: Props) {
  const { report, loading, error } = useInvestorReport();
  const days = report?.daily ?? [];
  const weeklyApps = days.reduce((s, d) => s + d.applications, 0);
  const weeklyApproved = days.reduce((s, d) => s + d.approved, 0);
  const weeklyDisbursed = days.reduce((s, d) => s + d.disbursed, 0);
  const weeklyCollected = days.reduce((s, d) => s + d.collected, 0);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const rangeLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const exportPdf = () => {
    if (!report) return;
    downloadPdf({
      title: "Weekly Report",
      subtitle: rangeLabel,
      tables: [
        { title: "7-Day Breakdown", head: ["Day", "Applications", "Approved", "Disbursed", "Collected"], rows: days.map((d) => [d.day, d.applications, d.approved, formatUGX(d.disbursed), formatUGX(d.collected)]) },
        { title: "Weekly Totals", head: ["Metric", "Value"], rows: [
          ["Applications", String(weeklyApps)],
          ["Approved", String(weeklyApproved)],
          ["Disbursed", formatUGX(weeklyDisbursed)],
          ["Collected", formatUGX(weeklyCollected)],
        ] },
      ],
    });
  };

  return (
    <AdminLayout activeScreen="admin-weekly-report" onNavigate={onNavigate} title="Weekly Report">
      <AdminPageHeader title={`Weekly Report — ${rangeLabel}`} subtitle="7-day operational summary"
        action={<button onClick={exportPdf} disabled={!report} style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:report?"pointer":"default",opacity:report?1:0.6,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export</button>}
      />
      {loading ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Loading this week…</div>
      ) : error || !report ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>This week's report is unavailable right now.</div>
      ) : (
      <>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Weekly Applications" value={String(weeklyApps)} color="#0D5C3A" icon={<></>}/>
        <StatCard label="Approved" value={String(weeklyApproved)} color="#8B5CF6" icon={<></>}/>
        <StatCard label="Disbursed" value={formatUGX(weeklyDisbursed)} color="#10B981" icon={<></>}/>
        <StatCard label="Collected" value={formatUGX(weeklyCollected)} color="#F59E0B" icon={<></>}/>
      </div>
      <AdminCard>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Daily Breakdown This Week</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={days}>
            <XAxis dataKey="day" tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ borderRadius:8,border:"none" }}/>
            <Bar key="applications" dataKey="applications" fill="#D2E9DD" radius={[4,4,0,0]} name="Applications"/>
            <Bar key="approved" dataKey="approved" fill="#0D5C3A" radius={[4,4,0,0]} name="Approved"/>
          </BarChart>
        </ResponsiveContainer>
      </AdminCard>
      </>
      )}
    </AdminLayout>
  );
}

// A8.4
export function AdminMonthlyReportScreen({ onNavigate }: Props) {
  const { report, loading, error } = useInvestorReport();
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const line = (report?.monthly ?? []).map((m) => ({ m: m.month, revenue: Math.round(m.collected / 1_000_000) }));
  return (
    <AdminLayout activeScreen="admin-monthly-report" onNavigate={onNavigate} title="Monthly Report">
      <AdminPageHeader title={`Monthly Report — ${monthLabel}`}
        action={<button onClick={()=>report&&exportInvestorReportPdf(report)} disabled={!report} style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:report?"pointer":"default",opacity:report?1:0.6,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export PDF</button>}
      />
      {loading ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Loading…</div>
      ) : error || !report ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Report unavailable.</div>
      ) : (
      <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>12-Month Collections Trend (UGX Millions)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={line}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
              <XAxis dataKey="m" tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ borderRadius:8,border:"none" }}/>
              <Line key="revenue" type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} dot={{ fill:"#10B981",r:4 }} name="Collected"/>
            </LineChart>
          </ResponsiveContainer>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Portfolio Summary</h3>
          {[["Total Loans",String(report.loans.total)],["Active",String(report.loans.active)],["Paid",String(report.loans.paid)],["Rejected",String(report.loans.rejected)],["Disbursed",formatUGX(report.revenue.totalDisbursed)],["Collected",formatUGX(report.revenue.totalCollected)],["Outstanding",formatUGX(report.loans.outstanding)],["Default Rate",`${report.ratios.defaultRatePct}%`]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:11,color:"#64748B" }}>{l}</span><span style={{ fontSize:11,fontWeight:700,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
      )}
    </AdminLayout>
  );
}

// A8.5
export function AdminExportReportScreen({ onNavigate }: Props) {
  const { report, loading, error } = useInvestorReport();
  const [fmt, setFmt] = useState("pdf");
  const generate = () => {
    if (!report) return;
    if (fmt === "pdf") exportInvestorReportPdf(report);
    else if (fmt === "excel") exportInvestorReportExcel(report);
    else exportInvestorReportCsv(report);
  };
  return (
    <AdminLayout activeScreen="admin-export-report" onNavigate={onNavigate} title="Export Report">
      <AdminPageHeader title="Export Report" subtitle="Download the live investor report in your preferred format"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Export Settings</h3>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Format</label>
            <div style={{ display:"flex",gap:8 }}>
              {["pdf","excel","csv"].map((f)=>(
                <button key={f} onClick={()=>setFmt(f)} style={{ flex:1,height:44,borderRadius:8,border:`2px solid ${fmt===f?"#0D5C3A":"#E2E8F0"}`,cursor:"pointer",fontSize:13,fontWeight:600,background:fmt===f?"#ECF5F0":"white",color:fmt===f?"#0D5C3A":"#374151",textTransform:"uppercase" }}>{f}</button>
              ))}
            </div>
          </div>
          {error && <p style={{ fontSize:12,color:"#EF4444",marginBottom:12 }}>The report could not be loaded.</p>}
          <button onClick={generate} disabled={loading || !report} style={{ width:"100%",height:48,borderRadius:12,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:loading||!report?"default":"pointer",opacity:loading||!report?0.6:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            <Download size={18}/> {loading ? "Loading live data…" : "Generate & Download Report"}
          </button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.1
export function AdminSettingsScreen({ onNavigate }: Props) {
  const ITEMS = [
    { label:"Loan Product Settings", sub:"Configure loan types and limits", screen:"admin-loan-products" },
    { label:"Interest Rate Settings", sub:"Set loan and savings interest rates", screen:"admin-interest-settings" },
    { label:"Service Fee Settings", sub:"Configure fees and charges", screen:"admin-service-fee" },
    { label:"MTN MoMo API", sub:"Mobile money integration config", screen:"admin-mtn-api" },
    { label:"Airtel Money API", sub:"Airtel payment integration config", screen:"admin-airtel-api" },
    { label:"Notification Templates", sub:"SMS and email template editor", screen:"admin-notif-templates" },
    { label:"Staff Management", sub:"Add, edit, and remove staff", screen:"admin-staff" },
    { label:"Staff Permissions", sub:"Role-based access control", screen:"admin-staff-permissions" },
    { label:"Compliance Settings", sub:"UMRA and BOU compliance", screen:"admin-compliance" },
  ];
  return (
    <AdminLayout activeScreen="admin-settings" onNavigate={onNavigate} title="Admin Settings">
      <AdminPageHeader title="Settings & Configuration"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14 }}>
        {ITEMS.map((item)=>(
          <button key={item.label} onClick={()=>onNavigate(item.screen)} style={{ background:"white",borderRadius:14,padding:"18px",border:"1px solid #F1F5F9",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",cursor:"pointer",textAlign:"left" }}>
            <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:"0 0 4px" }}>{item.label}</p>
            <p style={{ fontSize:12,color:"#64748B",margin:0 }}>{item.sub}</p>
          </button>
        ))}
      </div>
    </AdminLayout>
  );
}

// A9.2
export function AdminLoanProductsScreen({ onNavigate }: Props) {
  const PRODUCTS = [
    { name:"Quick Loan", min:"UGX 50K", max:"UGX 500K", terms:"7-30 days", rate:"8%/mo", status:"Active" },
    { name:"Business Loan", min:"UGX 500K", max:"UGX 2M", terms:"30-90 days", rate:"7%/mo", status:"Active" },
    { name:"Salary Advance", min:"UGX 100K", max:"UGX 1M", terms:"7-14 days", rate:"5%/mo", status:"Active" },
  ];
  return (
    <AdminLayout activeScreen="admin-loan-products" onNavigate={onNavigate} title="Loan Products">
      <AdminPageHeader title="Loan Product Settings" subtitle="Configure available loan types"
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/>New Product</button>}
      />
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        {PRODUCTS.map((p)=>(
          <AdminCard key={p.name}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div>
                <h3 style={{ fontSize:15,fontWeight:700,margin:"0 0 8px",color:"#0F172A" }}>{p.name}</h3>
                <div style={{ display:"flex",gap:20 }}>
                  {[["Min Amount",p.min],["Max Amount",p.max],["Terms",p.terms],["Interest",p.rate]].map(([l,v])=>(
                    <div key={l}>
                      <p style={{ fontSize:10,color:"#94A3B8",margin:0 }}>{l}</p>
                      <p style={{ fontSize:13,fontWeight:700,color:"#374151",margin:"2px 0 0" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ fontSize:11,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"3px 10px",borderRadius:20 }}>{p.status}</span>
                <button style={{ padding:"6px 12px",borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Edit</button>
              </div>
            </div>
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// A9.3
export function AdminInterestSettingsScreen({ onNavigate }: Props) {
  const [loanRate, setLoanRate] = useState("8.0");
  const [savingsRate, setSavingsRate] = useState("5.2");
  return (
    <AdminLayout activeScreen="admin-interest-settings" onNavigate={onNavigate} title="Interest Rates">
      <AdminPageHeader title="Interest Rate Settings"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Loan Interest Rates</h3>
          {["Quick Loan","Business Loan","Salary Advance"].map((p,i)=>(
            <div key={p} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<2?"1px solid #F8FAFC":"none" }}>
              <span style={{ fontSize:13,color:"#374151" }}>{p}</span>
              <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                <input type="number" defaultValue={[8,7,5][i]} step="0.5" min="0" max="50" style={{ width:60,height:34,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 8px",fontSize:14,fontWeight:700,color:"#0D5C3A",textAlign:"center",outline:"none" }}/>
                <span style={{ fontSize:12,color:"#64748B" }}>%/mo</span>
              </div>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Savings Interest Rate</h3>
          <div style={{ display:"flex",alignItems:"center",gap:16 }}>
            <input type="number" value={savingsRate} onChange={(e)=>setSavingsRate(e.target.value)} step="0.1" style={{ width:90,height:50,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:24,fontWeight:800,color:"#10B981",textAlign:"center",outline:"none" }}/>
            <div>
              <p style={{ fontSize:12,color:"#64748B",margin:0 }}>Annual rate</p>
              <p style={{ fontSize:13,fontWeight:700,color:"#374151",margin:"2px 0 0" }}>Monthly: {(Number(savingsRate)/12).toFixed(2)}% · Daily: {(Number(savingsRate)/365).toFixed(3)}%</p>
            </div>
          </div>
          <button style={{ width:"100%",height:44,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Rate Changes</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.4
export function AdminServiceFeeScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-service-fee" onNavigate={onNavigate} title="Service Fees">
      <AdminPageHeader title="Service Fee Settings"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard>
          {[{ label:"Loan Origination Fee",val:"2.5",note:"Charged on disbursement" },{ label:"Late Payment Penalty",val:"5.0",note:"Per week overdue" },{ label:"Early Repayment Fee",val:"0.0",note:"No penalty for early repayment" },{ label:"Withdrawal Fee (Savings)",val:"0.0",note:"Free withdrawals" }].map((f,i)=>(
            <div key={f.label} style={{ padding:"14px 0",borderBottom:i<3?"1px solid #F8FAFC":"none" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <p style={{ fontSize:13,fontWeight:600,color:"#0F172A",margin:0 }}>{f.label}</p>
                  <p style={{ fontSize:11,color:"#94A3B8",margin:"2px 0 0" }}>{f.note}</p>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <input type="number" defaultValue={f.val} step="0.5" style={{ width:64,height:36,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 8px",fontSize:16,fontWeight:800,color:"#0D5C3A",textAlign:"center",outline:"none" }}/>
                  <span style={{ fontSize:12,color:"#64748B" }}>%</span>
                </div>
              </div>
            </div>
          ))}
          <button style={{ width:"100%",height:44,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Fee Settings</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.5
export function AdminMTNAPIScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-mtn-api" onNavigate={onNavigate} title="MTN MoMo API">
      <AdminPageHeader title="MTN MoMo API Settings" subtitle="Configure MTN Mobile Money integration"/>
      <div style={{ maxWidth:580 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <span style={{ fontSize:32 }}>🟡</span>
            <div>
              <p style={{ fontSize:15,fontWeight:700,color:"#0F172A",margin:0 }}>MTN Mobile Money Uganda</p>
              <p style={{ fontSize:12,color:"#10B981",margin:"2px 0 0" }}>● Connected · Sandbox Mode</p>
            </div>
          </div>
          {[{ label:"API Key", value:"sk_live_mtn_••••••••••••4821",type:"password" },{ label:"API Secret", value:"••••••••••••••••••••••••",type:"password" },{ label:"Subscription Key", value:"sub_••••••••••••••••1234",type:"password" },{ label:"Callback URL", value:import.meta.env.VITE_MTN_CALLBACK_URL || "https://api.kuula.ug/mtn/callback",type:"text" },{ label:"Environment", value:import.meta.env.VITE_MTN_ENVIRONMENT || "sandbox",type:"text" }].map((f)=>(
            <div key={f.label} style={{ marginBottom:12 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>{f.label}</label>
              <input type={f.type} defaultValue={f.value} style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,color:"#374151",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
            </div>
          ))}
          <div style={{ display:"flex",gap:10,marginTop:8 }}>
            <button style={{ flex:1,height:42,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Save Settings</button>
            <button style={{ flex:1,height:42,borderRadius:10,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Test Connection</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.6
export function AdminAirtelAPIScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-airtel-api" onNavigate={onNavigate} title="Airtel Money API">
      <AdminPageHeader title="Airtel Money API Settings" subtitle="Configure Airtel Money integration"/>
      <div style={{ maxWidth:580 }}>
        <AdminCard>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <span style={{ fontSize:32 }}>🔴</span>
            <div>
              <p style={{ fontSize:15,fontWeight:700,color:"#0F172A",margin:0 }}>Airtel Money Uganda</p>
              <p style={{ fontSize:12,color:"#10B981",margin:"2px 0 0" }}>● Connected · Production</p>
            </div>
          </div>
          {[{ label:"Client ID", value:"airtel_client_••••••••••••9832" },{ label:"Client Secret", value:"••••••••••••••••••••••••" },{ label:"Callback URL", value:import.meta.env.VITE_AIRTEL_CALLBACK_URL || "https://api.kuula.ug/airtel/callback" },{ label:"Environment", value:import.meta.env.VITE_AIRTEL_ENVIRONMENT || "sandbox" }].map((f)=>(
            <div key={f.label} style={{ marginBottom:12 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>{f.label}</label>
              <input type="text" defaultValue={f.value} style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,color:"#374151",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
            </div>
          ))}
          <div style={{ display:"flex",gap:10 }}>
            <button style={{ flex:1,height:42,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Save Settings</button>
            <button style={{ flex:1,height:42,borderRadius:10,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Test Connection</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.7
export function AdminNotifTemplatesScreen({ onNavigate }: Props) {
  const TEMPLATES = ["Loan Approved SMS","Loan Rejected SMS","Payment Due Reminder","Overdue Loan Alert","Welcome Message","OTP Verification"];
  const [active, setActive] = useState(0);
  const [body, setBody] = useState("Dear {{name}}, your loan of {{amount}} has been approved and disbursed to {{method}}. Due date: {{due_date}}. Ref: {{loan_ref}}. Kuula Microfinance.");
  return (
    <AdminLayout activeScreen="admin-notif-templates" onNavigate={onNavigate} title="Notification Templates">
      <AdminPageHeader title="Notification Templates" subtitle="Edit SMS and email message templates"/>
      <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
          {TEMPLATES.map((t,i)=>(
            <button key={t} onClick={()=>setActive(i)} style={{ padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"left",fontSize:12,fontWeight:active===i?700:500,background:active===i?"#ECF5F0":"white",color:active===i?"#0D5C3A":"#374151",boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>{t}</button>
          ))}
        </div>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 4px" }}>{TEMPLATES[active]}</h3>
          <p style={{ fontSize:11,color:"#94A3B8",margin:"0 0 16px" }}>Available variables: {"{{name}}, {{amount}}, {{method}}, {{due_date}}, {{loan_ref}}"}</p>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Message Body</label>
          <textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={5} style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8 }}>
            <span style={{ fontSize:11,color:"#94A3B8" }}>{body.length} / 160 chars</span>
            <div style={{ display:"flex",gap:8 }}>
              <button style={{ padding:"8px 14px",borderRadius:8,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Send Test</button>
              <button style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Save Template</button>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.8
export function AdminStaffManagementScreen({ onNavigate }: Props) {
  const STAFF = [
    { name:"Alice Kabanda",role:"Senior Loan Officer",email:"alice@kuula.ug",status:"Active",lastLogin:"2 hours ago" },
    { name:"Brian Ssali",role:"Credit Analyst",email:"brian@kuula.ug",status:"Active",lastLogin:"1 day ago" },
    { name:"Christine Ajok",role:"Admin Manager",email:"christine@kuula.ug",status:"Active",lastLogin:"Just now" },
    { name:"Daniel Muwonge",role:"Support Agent",email:"daniel@kuula.ug",status:"Inactive",lastLogin:"5 days ago" },
  ];
  return (
    <AdminLayout activeScreen="admin-staff" onNavigate={onNavigate} title="Staff Management">
      <AdminPageHeader title="Staff Management" subtitle="4 staff members"
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/>Add Staff</button>}
      />
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        {STAFF.map((s)=>(
          <AdminCard key={s.name}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{s.name.split(" ").map(n=>n[0]).join("")}</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{s.name}</p>
                <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>{s.role} · {s.email}</p>
                <p style={{ fontSize:11,color:"#94A3B8",margin:"2px 0 0" }}>Last login: {s.lastLogin}</p>
              </div>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ fontSize:11,fontWeight:700,color:s.status==="Active"?"#10B981":"#9CA3AF",background:s.status==="Active"?"#F0FDF4":"#F3F4F6",padding:"3px 10px",borderRadius:20 }}>{s.status}</span>
                <button style={{ padding:"6px 12px",borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Edit</button>
                <button style={{ padding:"6px 12px",borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Remove</button>
              </div>
            </div>
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// A9.9
export function AdminStaffPermissionsScreen({ onNavigate }: Props) {
  const ROLES = ["Admin Manager","Senior Loan Officer","Credit Analyst","Support Agent"];
  const PERMS = ["View Loans","Approve Loans","Reject Loans","View Customers","Edit Customers","Block Customers","View Reports","Export Reports","Manage Staff","System Settings"];
  const [selected, setSelected] = useState(0);
  return (
    <AdminLayout activeScreen="admin-staff-permissions" onNavigate={onNavigate} title="Staff Permissions">
      <AdminPageHeader title="Staff Permission Settings" subtitle="Role-based access control"/>
      <div style={{ display:"grid",gridTemplateColumns:"200px 1fr",gap:16 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
          {ROLES.map((r,i)=>(
            <button key={r} onClick={()=>setSelected(i)} style={{ padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"left",fontSize:12,fontWeight:selected===i?700:500,background:selected===i?"#ECF5F0":"white",color:selected===i?"#0D5C3A":"#374151" }}>{r}</button>
          ))}
        </div>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Permissions for: {ROLES[selected]}</h3>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
            {PERMS.map((p,i)=>{
              const defaultOn = selected===0||(selected===1&&i<4)||(selected===2&&i<3);
              return (
                <label key={p} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#F8FAFC",cursor:"pointer" }}>
                  <input type="checkbox" defaultChecked={defaultOn} style={{ accentColor:"#0D5C3A",width:16,height:16 }}/>
                  <span style={{ fontSize:12,fontWeight:500,color:"#374151" }}>{p}</span>
                </label>
              );
            })}
          </div>
          <button style={{ width:"100%",height:42,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Save Permissions</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.10
export function AdminComplianceScreen({ onNavigate }: Props) {
  const [retention, setRetention] = useState("7");
  return (
    <AdminLayout activeScreen="admin-compliance" onNavigate={onNavigate} title="Compliance Settings">
      <AdminPageHeader title="Compliance Settings" subtitle="UMRA and Bank of Uganda regulatory compliance"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Regulatory Information</h3>
          {[["License Type","Microfinance Deposit-Taking Institution (MDI)"],["UMRA License No","UMRA/MDI/2021/047"],["BOU Registration","BOU/MFI/2021/312"],["License Expiry","December 31, 2026"],["Compliance Officer","Christine Ajok · COO"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
        <AdminCard style={{ marginBottom:14 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Data Retention Policy</h3>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Customer data retention period (years)</label>
          <div style={{ display:"flex",gap:8 }}>
            {["5","7","10"].map((y)=>(
              <button key={y} onClick={()=>setRetention(y)} style={{ flex:1,height:44,borderRadius:10,border:"none",cursor:"pointer",fontSize:16,fontWeight:800,background:retention===y?"#0D5C3A":"#F3F4F6",color:retention===y?"white":"#374151" }}>{y} yrs</button>
            ))}
          </div>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Compliance Checklist</h3>
          {["KYC verification for all customers","AML transaction monitoring active","Data encrypted at rest and in transit","Regular security audits scheduled","Credit bureau reporting enabled","Fraud detection system active"].map((item,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<5?"1px solid #F8FAFC":"none" }}>
              <Check size={16} color="#10B981"/>
              <span style={{ fontSize:12,color:"#374151" }}>{item}</span>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A10.1
export function AdminTicketsListScreen({ onNavigate }: Props) {
  const TICKETS = [
    { id:"TKT-0482",customer:"Amara Nakato",subject:"Payment not reflected",priority:"High",status:"Open",date:"Jun 11" },
    { id:"TKT-0481",customer:"David Ochieng",subject:"Loan application issue",priority:"Medium",status:"In Progress",date:"Jun 10" },
    { id:"TKT-0480",customer:"Sarah Akello",subject:"Account login problem",priority:"Low",status:"Resolved",date:"Jun 9" },
    { id:"TKT-0479",customer:"James Ssemakula",subject:"Interest rate query",priority:"Low",status:"Resolved",date:"Jun 8" },
  ];
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Support Tickets">
      <AdminPageHeader title="Support Tickets" subtitle="12 open · 3 in progress · 47 resolved this month"
        action={<div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <div style={{ padding:"4px 12px",borderRadius:20,background:"#FEF2F2",fontSize:12,fontWeight:700,color:"#991B1B" }}>4 High Priority</div>
        </div>}
      />
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {TICKETS.map((t)=>(
          <button key={t.id} onClick={()=>onNavigate("admin-ticket-detail")} style={{ background:"white",borderRadius:14,padding:"14px 18px",border:"1px solid #F1F5F9",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:16,width:"100%" }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                <span style={{ fontSize:11,color:"#94A3B8",fontWeight:600 }}>{t.id}</span>
                <span style={{ fontSize:11,fontWeight:700,color:t.priority==="High"?"#EF4444":t.priority==="Medium"?"#F59E0B":"#10B981",background:t.priority==="High"?"#FEF2F2":t.priority==="Medium"?"#FFF7ED":"#F0FDF4",padding:"2px 8px",borderRadius:20 }}>{t.priority}</span>
              </div>
              <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{t.subject}</p>
              <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>{t.customer} · {t.date}</p>
            </div>
            <span style={{ fontSize:11,fontWeight:700,color:t.status==="Open"?"#EF4444":t.status==="In Progress"?"#F59E0B":"#10B981",background:t.status==="Open"?"#FEF2F2":t.status==="In Progress"?"#FFF7ED":"#F0FDF4",padding:"4px 12px",borderRadius:20,whiteSpace:"nowrap" }}>{t.status}</span>
          </button>
        ))}
      </div>
    </AdminLayout>
  );
}

// A10.2
export function AdminTicketDetailScreen({ onNavigate }: Props) {
  const [reply, setReply] = useState("");
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Support Ticket">
      <AdminPageHeader title="Ticket TKT-0482 · Payment Not Reflected"
        action={<div style={{ display:"flex",gap:8 }}>
          <button style={{ padding:"7px 14px",borderRadius:8,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Mark Resolved</button>
          <button style={{ padding:"7px 14px",borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Escalate</button>
        </div>}
      />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 280px",gap:16 }}>
        <div>
          <AdminCard style={{ marginBottom:14 }}>
            <div style={{ padding:"12px 14px",borderRadius:10,background:"#F8FAFC",marginBottom:16 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                <div style={{ width:32,height:32,borderRadius:16,background:"#D2E9DD",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <span style={{ fontSize:12,fontWeight:700,color:"#0D5C3A" }}>AN</span>
                </div>
                <div>
                  <p style={{ fontSize:12,fontWeight:700,color:"#0F172A",margin:0 }}>Amara Nakato</p>
                  <p style={{ fontSize:10,color:"#94A3B8",margin:0 }}>Jun 11, 2026 · 09:41 AM</p>
                </div>
              </div>
              <p style={{ fontSize:13,color:"#374151",margin:0,lineHeight:1.6 }}>I made a loan repayment of UGX 92,083 via MTN MoMo yesterday (Jun 10, 2026) but it is not showing in my account. The MoMo transaction ID is MTN-447821. Please assist urgently.</p>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <textarea value={reply} onChange={(e)=>setReply(e.target.value)} placeholder="Type your reply to the customer..." rows={3} style={{ flex:1,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",resize:"none" }}/>
              <button onClick={()=>setReply("")} style={{ height:88,padding:"0 16px",borderRadius:10,background:"#0D5C3A",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <Send size={18}/>
              </button>
            </div>
          </AdminCard>
        </div>
        <AdminCard>
          <h3 style={{ fontSize:13,fontWeight:700,margin:"0 0 12px" }}>Customer Info</h3>
          {[["Name","Amara Nakato"],["Phone","+256 770 123 456"],["Loan ID","KUL-04821"],["Priority","High"],["Opened","Jun 11, 2026"],["Status","Open"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:11,color:"#64748B" }}>{l}</span><span style={{ fontSize:11,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
          <button onClick={()=>onNavigate("admin-customer-detail")} style={{ width:"100%",height:36,marginTop:12,borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>View Customer Profile</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A10.3
export function AdminBulkSMSScreen({ onNavigate }: Props) {
  const [msg, setMsg] = useState("");
  const [audience, setAudience] = useState("all");
  return (
    <AdminLayout activeScreen="admin-bulk-sms" onNavigate={onNavigate} title="Bulk SMS">
      <AdminPageHeader title="Bulk SMS" subtitle="Send SMS messages to multiple customers"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Target Audience</label>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {[["all","All Customers (3,847)"],["active","Active Borrowers (1,203)"],["overdue","Overdue Customers (18)"],["new","New This Month (247)"]].map(([id,label])=>(
                <button key={id} onClick={()=>setAudience(id)} style={{ padding:"7px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:audience===id?"#0D5C3A":"#F3F4F6",color:audience===id?"white":"#6B7280" }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Message</label>
            <textarea value={msg} onChange={(e)=>setMsg(e.target.value)} rows={5} placeholder="Type your SMS message here. Use {{name}} for personalization..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
              <span style={{ fontSize:11,color:"#94A3B8" }}>Character count: {msg.length} / 160</span>
              <span style={{ fontSize:11,color:"#94A3B8" }}>SMS count: {Math.ceil(msg.length/160) || 1}</span>
            </div>
          </div>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA",marginBottom:16 }}>
            <p style={{ fontSize:12,color:"#92400E",margin:0 }}>⚠ This will send SMS to all customers in the selected audience. Estimated cost: UGX {(3847*150).toLocaleString()}.</p>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
              <Send size={16}/> Send Bulk SMS
            </button>
            <button style={{ flex:1,height:46,borderRadius:10,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Preview</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A10.4
export function AdminBulkEmailScreen({ onNavigate }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <AdminLayout activeScreen="admin-bulk-email" onNavigate={onNavigate} title="Bulk Email">
      <AdminPageHeader title="Bulk Email" subtitle="Send email campaigns to customers"/>
      <div style={{ maxWidth:700 }}>
        <AdminCard>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Subject Line</label>
            <input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="e.g. Important update from Kuula Microfinance" style={{ width:"100%",height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:14,color:"#374151",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Email Body</label>
            <textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={10} placeholder="Compose your email here. Use {{name}}, {{loan_id}}, {{amount}} for personalization..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"12px 14px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          </div>
          <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
            {["All Customers","Active Borrowers","Overdue Customers","Savings Users"].map((a)=>(
              <button key={a} style={{ padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:"#F3F4F6",color:"#6B7280" }}>{a}</button>
            ))}
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
              <Send size={16}/> Send Email Campaign
            </button>
            <button style={{ flex:1,height:46,borderRadius:10,background:"#F3F4F6",color:"#374151",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Draft</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
