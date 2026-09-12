import React, { useState } from "react";
import {
  LayoutDashboard, ClipboardCheck, FileText, Users, Building2,
  BarChart3, Settings, MessageSquare, ChevronDown, ChevronRight,
  Bell, LogOut, Search, Menu, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import kuulaLogo from "/kuula-icon.svg";
import { useAppContext } from "../context/AppContext";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: { id: string; label: string }[];
}

const NAV: NavItem[] = [
  { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "admin-credit-operations", label: "Credit Operations", icon: ClipboardCheck,
    children: [
      { id: "admin-officer-dashboard", label: "My Review Queue" },
      { id: "admin-officer-assignment", label: "Intake & Assignment" },
      { id: "admin-approval-workflow", label: "Approval Workflow" },
      { id: "admin-officer-contact", label: "Search & Customer 360°" },
    ],
  },
  {
    id: "admin-loans", label: "Facilities", icon: FileText,
    children: [
      { id: "admin-loan-apps", label: "Applications" },
      { id: "admin-active-loans", label: "Active Facilities" },
      { id: "admin-overdue-loans", label: "Overdue" },
      { id: "admin-loan-history", label: "Facility History" },
    ],
  },
  {
    id: "admin-customers", label: "Customers", icon: Users,
    children: [
      { id: "admin-customer-list", label: "All Customers" },
      { id: "admin-customer-kyc", label: "KYC Verification" },
    ],
  },
  { id: "admin-partner-financing", label: "Partner Financing", icon: Building2 },
  { id: "admin-reports", label: "Reports", icon: BarChart3 },
  {
    id: "admin-settings", label: "Settings", icon: Settings,
    children: [
      { id: "admin-staff", label: "Staff Management" },
    ],
  },
  {
    id: "admin-support", label: "Support", icon: MessageSquare,
    children: [
      { id: "admin-support-inbox", label: "Support Inbox" },
    ],
  },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  activeScreen: string;
  onNavigate: (screen: string) => void;
  title: string;
}

export function AdminLayout({ children, activeScreen, onNavigate, title }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { state, logout } = useAppContext();
  const [expanded, setExpanded] = useState<string[]>(["admin-credit-operations"]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggle = (id: string) => setExpanded((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const role = state.role;
  const can = (item: NavItem) => {
    if (item.id === "admin-dashboard") return true;
    if (item.id === "admin-credit-operations" || item.id === "admin-loans") return ["super_admin", "administrator", "credit_manager", "final_approver", "loan_officer", "collections", "admin", "manager", "officer"].includes(role || "");
    if (item.id === "admin-customers") return role !== "finance";
    if (item.id === "admin-partner-financing") return ["super_admin", "administrator", "admin"].includes(role || "");
    if (item.id === "admin-reports") return ["super_admin", "administrator", "credit_manager", "final_approver", "finance", "admin", "manager"].includes(role || "");
    if (item.id === "admin-settings") return role === "super_admin";
    if (item.id === "admin-support") return ["super_admin", "administrator", "credit_manager", "loan_officer", "collections", "support", "admin", "manager", "officer"].includes(role || "");
    return false;
  };
  const visibleNav = NAV.filter(can);

  return (
    <div style={{ display: "flex", height: "100%", background: "#F8FAF9", fontFamily: "Poppins, system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: sidebarOpen ? 238 : 0, minWidth: sidebarOpen ? 238 : 0, background: "#062D1C", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width .2s,min-width .2s", flexShrink: 0 }}>
        <div style={{ padding: "16px 14px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={kuulaLogo} alt="Kuula" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }} />
            <div><div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Kuula</div><div style={{ fontSize: 9, color: "#9EC1B1" }}>Credit Operations</div></div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "7px 0" }}>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id || item.children?.some((c) => c.id === activeScreen);
            const open = expanded.includes(item.id);
            return (
              <div key={item.id}>
                <button onClick={() => item.children ? toggle(item.id) : onNavigate(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", background: active && !item.children ? "rgba(242,201,76,.12)" : "transparent", border: "none", borderLeft: active && !item.children ? "2px solid #F2C94C" : "2px solid transparent", cursor: "pointer", textAlign: "left" }}>
                  <Icon size={15} color={active ? "#F2C94C" : "#8FB5A4"} />
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "white" : "#B8D1C5", flex: 1, whiteSpace: "nowrap" }}>{item.label}</span>
                  {item.children && (open ? <ChevronDown size={12} color="#8FB5A4" /> : <ChevronRight size={12} color="#8FB5A4" />)}
                </button>
                {item.children && open && <div style={{ paddingLeft: 38 }}>{item.children.map((child) => <button key={child.id} onClick={() => onNavigate(child.id)} style={{ width: "100%", display: "block", padding: "7px 14px 7px 0", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontSize: 11, fontWeight: activeScreen === child.id ? 700 : 400, color: activeScreen === child.id ? "#F2C94C" : "#8FB5A4", whiteSpace: "nowrap" }}>{child.label}</button>)}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.08)" }}><button onClick={() => { logout(); navigate("/admin-login", { replace: true }); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 0", background: "transparent", border: "none", cursor: "pointer" }}><LogOut size={14} color="#FCA5A5" /><span style={{ fontSize: 11, color: "#FCA5A5", fontWeight: 600 }}>Log Out</span></button></div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{ height: 52, background: "white", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}><Menu size={17} color="#64748B" /></button>
          {activeScreen !== "admin-dashboard" && <button onClick={() => { const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0; if (idx > 0) navigate(-1); else onNavigate("admin-dashboard"); }} aria-label="Go back" style={{ border: "none", background: "#F1F5F9", borderRadius: 8, cursor: "pointer", padding: 6, display: "flex" }}><ArrowLeft size={17} color="#334155" /></button>}
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "#062D1C", flex: 1, margin: 0 }}>{title}</h1>
          <button onClick={() => onNavigate("admin-officer-contact")} style={{ display: "flex", alignItems: "center", gap: 7, background: "#F1F5F9", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: "#475569", fontSize: 12 }}><Search size={13} /> Search customers</button>
          <button style={{ border: "none", background: "none", cursor: "pointer" }} aria-label="Notifications"><Bell size={17} color="#64748B" /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, color = "#0B5E3A", icon }: { label: string; value: string; sub?: string; color?: string; icon: React.ReactNode }) {
  return <div style={{ background: "white", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1px solid #E7EEE9", flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .4 }}>{label}</span><div style={{ width: 32, height: 32, borderRadius: 9, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div></div><div style={{ fontSize: 24, fontWeight: 800, color: "#062D1C" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}</div>;
}

export function AdminTable({ columns, rows, onRowClick }: { columns: string[]; rows: (string | React.ReactNode)[][]; onRowClick?: (i: number) => void }) {
  return <div style={{ background: "white", borderRadius: 12, border: "1px solid #E7EEE9", overflow: "hidden" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F8FAF9" }}>{columns.map((col) => <th key={col} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>{col}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} onClick={() => onRowClick?.(i)} style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : "none", cursor: onRowClick ? "pointer" : "default" }}>{row.map((cell, j) => <td key={j} style={{ padding: "11px 14px", fontSize: 12, color: "#374151" }}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active: { bg: "#F0FDF4", color: "#0B5E3A" }, approved: { bg: "#F0FDF4", color: "#0B5E3A" }, verified: { bg: "#F0FDF4", color: "#0B5E3A" }, paid: { bg: "#F0FDF4", color: "#0B5E3A" }, ready_for_offer: { bg: "#F0FDF4", color: "#0B5E3A" },
    completed: { bg: "#EFF6FF", color: "#2563EB" }, field_evaluation: { bg: "#EFF6FF", color: "#2563EB" }, level2_review: { bg: "#F5F3FF", color: "#7C3AED" }, final_review: { bg: "#ECFDF5", color: "#047857" },
    pending: { bg: "#FFFBEB", color: "#B45309" }, offered: { bg: "#F5F3FF", color: "#7C3AED" }, returned_for_clarification: { bg: "#FFF7ED", color: "#C2410C" }, medium: { bg: "#FFF7ED", color: "#B45309" },
    rejected: { bg: "#FEF2F2", color: "#B91C1C" }, overdue: { bg: "#FEF2F2", color: "#B91C1C" }, failed: { bg: "#FEF2F2", color: "#B91C1C" }, blocked: { bg: "#FEF2F2", color: "#B91C1C" }, high: { bg: "#FEF2F2", color: "#B91C1C" }, low: { bg: "#F0FDF4", color: "#0B5E3A" },
  };
  const style = map[status.toLowerCase()] ?? { bg: "#F1F5F9", color: "#64748B" };
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>{status.replaceAll("_", " ")}</span>;
}

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 }}><div><h2 style={{ fontSize: 18, fontWeight: 800, color: "#062D1C", margin: 0 }}>{title}</h2>{subtitle && <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0", maxWidth: 760 }}>{subtitle}</p>}</div>{action}</div>;
}

export function AdminCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1px solid #E7EEE9", ...style }}>{children}</div>;
}
