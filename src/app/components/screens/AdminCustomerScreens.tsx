/**
 * Admin Customer Management Screens
 * A4.1 CustomerList | A4.2 CustomerDetail | A4.3 CustomerKYC
 * A4.4 CustomerRisk | A4.5 BlockCustomer
 */

import React, { useState, useEffect } from "react";
import { Search, Shield, AlertTriangle, Lock, Unlock } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { CustomerRow } from "../../api/types-compat";

interface Props { onNavigate: (s: string) => void; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// A4.1
export function AdminCustomerListScreen({ onNavigate }: Props) {
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getCustomers(token)
      .then(({ customers: rows }) => setCustomers(rows))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  const verifiedCount = customers.filter((c) => c.verified).length;

  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Customer Management">
      <AdminPageHeader
        title="All Customers"
        subtitle={loading ? "Loading…" : `${customers.length} registered users`}
        action={
          <div style={{ display:"flex",alignItems:"center",gap:8,background:"white",borderRadius:8,padding:"6px 12px",border:"1px solid #E2E8F0",width:220 }}>
            <Search size={14} color="#94A3B8"/>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search customers..." style={{ border:"none",outline:"none",fontSize:13,color:"#374151",flex:1 }}/>
          </div>
        }
      />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Customers" value={loading ? "…" : String(customers.length)} color="#0B5E3A" icon={<></>}/>
        <StatCard label="Verified (KYC)" value={loading ? "…" : String(verifiedCount)} sub={customers.length > 0 ? `${Math.round(verifiedCount / customers.length * 100)}%` : "—"} color="#178654" icon={<></>}/>
        <StatCard label="Total Loans Taken" value={loading ? "…" : String(customers.reduce((s, c) => s + (c.loans_total ?? 0), 0))} color="#F59E0B" icon={<></>}/>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading customers…</div>
      ) : filtered.length === 0 && search ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No customers match "{search}"</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No registered customers yet</div>
      ) : (
        <AdminTable
          columns={["Name","Phone","Loans Total","Member Since","Status"]}
          rows={filtered.map((c)=>[
            c.full_name,
            c.phone ?? "—",
            String(c.loans_total ?? 0),
            fmtDate(c.created_at),
            <StatusBadge key={c.id} status={c.verified ? "approved" : "pending"}/>,
          ])}
          onRowClick={()=>onNavigate("admin-customer-detail")}
        />
      )}
    </AdminLayout>
  );
}

// A4.2
export function AdminCustomerDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Customer Detail">
      <AdminPageHeader title="Customer Detail" subtitle="Select a customer from the list to view their profile"
        action={
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={()=>onNavigate("admin-customer-kyc")} style={{ padding:"8px 14px",borderRadius:8,background:"#F3FAF7",color:"#0B5E3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>View KYC</button>
            <button onClick={()=>onNavigate("admin-block-customer")} style={{ padding:"8px 14px",borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Block</button>
          </div>
        }
      />
      <div style={{ padding: "24px 0", textAlign: "center", color: "#9CA3AF" }}>
        <Shield size={36} color="#D1D5DB" style={{ margin: "0 auto 12px" }}/>
        <p style={{ fontSize: 14 }}>Navigate from the customer list to view a specific customer's profile.</p>
      </div>
    </AdminLayout>
  );
}

// A4.3
export function AdminCustomerKYCScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC Verification">
      <AdminPageHeader title="KYC Verification"
        action={<StatusBadge status="approved"/>}
      />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Submitted Documents</h3>
          {[
            { label:"National ID (Front)", status:"verified", date:"On file" },
            { label:"National ID (Back)", status:"verified", date:"On file" },
            { label:"Selfie Photo", status:"verified", date:"On file" },
          ].map((d)=>(
            <div key={d.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #F8FAFC" }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600,color:"#0F172A",margin:0 }}>{d.label}</p>
                <p style={{ fontSize:11,color:"#94A3B8",margin:"2px 0 0" }}>{d.date}</p>
              </div>
              <StatusBadge status={d.status}/>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Verification Result</h3>
          {[["NIRA Match","✓ Verified"],["Verified By","NIRA API v2.1"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span>
              <span style={{ fontSize:12,fontWeight:600,color:v.includes("✓")?"#178654":"#0F172A" }}>{v}</span>
            </div>
          ))}
          <div style={{ display:"flex",gap:10,marginTop:16 }}>
            <button style={{ flex:1,height:40,borderRadius:8,background:"#178654",color:"white",border:"none",fontSize:13,fontWeight:600,cursor:"pointer" }}>Mark Verified</button>
            <button style={{ flex:1,height:40,borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:13,fontWeight:600,cursor:"pointer" }}>Flag Issue</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A4.4
export function AdminCustomerRiskScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Risk Profile">
      <AdminPageHeader title="Customer Risk Profile" subtitle="Risk assessment"
        action={<StatusBadge status="low"/>}
      />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Risk Score Breakdown</h3>
          {[
            { label:"Payment History",score:92,color:"#178654" },
            { label:"Credit Utilization",score:68,color:"#064A2E" },
            { label:"Income Stability",score:75,color:"#F59E0B" },
            { label:"Identity Verification",score:100,color:"#178654" },
            { label:"Loan-to-Income Ratio",score:80,color:"#8B5CF6" },
          ].map((r)=>(
            <div key={r.label} style={{ marginBottom:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontSize:12,color:"#374151" }}>{r.label}</span>
                <span style={{ fontSize:12,fontWeight:700,color:r.color }}>{r.score}/100</span>
              </div>
              <div style={{ height:6,background:"#F3F4F6",borderRadius:3 }}>
                <div style={{ width:`${r.score}%`,height:"100%",background:r.color,borderRadius:3 }}/>
              </div>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Risk Flags</h3>
          <div style={{ padding:"12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0",marginBottom:10 }}>
            <p style={{ fontSize:12,color:"#065F46",margin:0 }}>✓ No risk flags detected</p>
          </div>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"12px 0 12px" }}>Credit Limit</h3>
          {[["Current Limit","UGX 1,500,000"],["Available","Computed from credit score"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
          <button style={{ width:"100%",height:40,marginTop:16,borderRadius:8,background:"#0B5E3A",color:"white",border:"none",fontSize:13,fontWeight:600,cursor:"pointer" }}>Increase Credit Limit</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A4.5
export function AdminBlockCustomerScreen({ onNavigate }: Props) {
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Block/Unblock Customer">
      <AdminPageHeader title={blocked ? "Unblock Customer" : "Block Customer"} subtitle="Customer account management"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:20 }}>
            <div style={{ width:56,height:56,borderRadius:28,background:blocked?"#FEF2F2":"#F3FAF7",border:`2px solid ${blocked?"#FECACA":"#DFF2E9"}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
              {blocked ? <Lock size={28} color="#EF4444"/> : <Unlock size={28} color="#0B5E3A"/>}
            </div>
            <div>
              <p style={{ fontSize:16,fontWeight:800,color:"#0F172A",margin:0 }}>Customer Account</p>
              <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>Select from the customer list before blocking</p>
            </div>
            <StatusBadge status={blocked?"rejected":"active"}/>
          </div>
          <div style={{ padding:"12px 14px",borderRadius:10,background:blocked?"#FEF2F2":"#FFF7ED",border:`1px solid ${blocked?"#FECACA":"#FED7AA"}`,marginBottom:16 }}>
            <p style={{ fontSize:12,color:blocked?"#991B1B":"#92400E",margin:0 }}>
              {blocked?"This customer's account is currently BLOCKED. They cannot log in or apply for loans.":"Blocking this account will prevent the customer from logging in and applying for loans."}
            </p>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Reason *</label>
            <textarea value={reason} onChange={(e)=>setReason(e.target.value)} rows={3} placeholder="Explain why this account is being blocked..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button onClick={()=>setBlocked(!blocked)} style={{ flex:1,height:46,borderRadius:10,background:blocked?"#178654":"#EF4444",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>
              {blocked?"✓ Unblock Account":"Block Account"}
            </button>
            <button onClick={()=>onNavigate("admin-customer-list")} style={{ flex:1,height:46,borderRadius:10,background:"#F1F5F9",color:"#64748B",border:"none",fontSize:14,fontWeight:600,cursor:"pointer" }}>Cancel</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
