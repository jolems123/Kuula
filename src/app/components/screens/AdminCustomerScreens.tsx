/**
 * Admin Customer Management Screens
 * A4.1 CustomerList | A4.2 CustomerDetail | A4.3 CustomerKYC
 * A4.4 CustomerRisk | A4.5 BlockCustomer
 */

import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, StatCard } from "../AdminLayout";
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
        />
      )}
    </AdminLayout>
  );
}
