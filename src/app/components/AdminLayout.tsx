import React, { useState } from "react";
import {
  LayoutDashboard, FileText, Users, PiggyBank, Star, CreditCard,
  BarChart3, Settings, MessageSquare, ChevronDown, ChevronRight,
  Bell, LogOut, Search, Menu, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import kuulaLogo from "../../imports/kuula-tile-1024.png";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: { id: string; label: string }[];
}

const NAV: NavItem[] = [
  { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "admin-loans", label: "Loans", icon: FileText,
    children: [
      { id: "admin-loan-apps",          label: "Applications" },
      { id: "admin-active-loans",       label: "Active Loans" },
      { id: "admin-overdue-loans",      label: "Overdue Loans" },
      { id: "admin-loan-history",       label: "Loan History" },
    ],
  },
  {
    id: "admin-customers", label: "Customers", icon: Users,
    children: [
      { id: "admin-customer-list",  label: "All Customers" },
      { id: "admin-customer-kyc",   label: "KYC Verification" },
      { id: "admin-customer-risk",  label: "Risk Profiles" },
    ],
  },
  {
    id: "admin-savings", label: "Savings", icon: PiggyBank,
    children: [
      { id: "admin-all-savings",          label: "All Accounts" },
      { id: "admin-savings-transactions", label: "Transactions" },
      { id: "admin-interest-rate",        label: "Interest Rates" },
    ],
  },
  { id: "admin-credit-scores", label: "Credit Scoring", icon: Star },
  {
    id: "admin-payments", label: "Payments", icon: CreditCard,
    children: [
      { id: "admin-all-transactions",    label: "All Transactions" },
      { id: "admin-failed-transactions", label: "Failed" },
      { id: "admin-payment-processing",  label: "Manual Processing" },
    ],
  },
  {
    id: "admin-reports", label: "Reports", icon: BarChart3,
    children: [
      { id: "admin-daily-report",   label: "Daily" },
      { id: "admin-weekly-report",  label: "Weekly" },
      { id: "admin-monthly-report", label: "Monthly" },
      { id: "admin-export-report",  label: "Export" },
    ],
  },
  {
    id: "admin-settings", label: "Settings", icon: Settings,
    children: [
      { id: "admin-loan-products",    label: "Loan Products" },
      { id: "admin-interest-settings",label: "Interest Rates" },
      { id: "admin-service-fee",      label: "Service Fees" },
      { id: "admin-mtn-api",          label: "MTN MoMo API" },
      { id: "admin-airtel-api",       label: "Airtel API" },
      { id: "admin-notif-templates",  label: "Notif Templates" },
      { id: "admin-staff",            label: "Staff Management" },
      { id: "admin-staff-permissions",label: "Permissions" },
      { id: "admin-compliance",       label: "Compliance" },
    ],
  },
  {
    id: "admin-support", label: "Support", icon: MessageSquare,
    children: [
      { id: "admin-support-inbox", label: "Support Inbox" },
      { id: "admin-tickets",      label: "Tickets" },
      { id: "admin-bulk-sms",     label: "Bulk SMS" },
      { id: "admin-bulk-email",   label: "Bulk Email" },
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
  const [expanded, setExpanded] = useState<string[]>(["admin-loans"]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggle = (id: string) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div style={{ display: "flex", height: "100%", background: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? 220 : 0,
          minWidth: sidebarOpen ? 220 : 0,
          background: "#0F172A",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s, min-width 0.2s",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={kuulaLogo} alt="Kuula" style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "white", lineHeight: 1 }}>Kuula</div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>Admin Console</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0", scrollbarWidth: "none" }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id || item.children?.some((c) => c.id === activeScreen);
            const isExpanded = expanded.includes(item.id);

            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (item.children) toggle(item.id);
                    else onNavigate(item.id);
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 14px", background: isActive && !item.children ? "rgba(255,107,53,0.15)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    borderLeft: isActive && !item.children ? "2px solid #FF6B35" : "2px solid transparent",
                  }}
                >
                  <Icon size={15} color={isActive ? "#FF6B35" : "#475569"} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? "#E2E8F0" : "#64748B", flex: 1, whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                  {item.children && (
                    isExpanded
                      ? <ChevronDown size={12} color="#475569" />
                      : <ChevronRight size={12} color="#475569" />
                  )}
                </button>
                {item.children && isExpanded && (
                  <div style={{ paddingLeft: 38 }}>
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => onNavigate(child.id)}
                        style={{
                          width: "100%", display: "block", padding: "7px 14px 7px 0",
                          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                          fontSize: 11, fontWeight: activeScreen === child.id ? 600 : 400,
                          color: activeScreen === child.id ? "#FF6B35" : "#475569",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <button
            onClick={() => onNavigate("welcome")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 0", background: "transparent", border: "none", cursor: "pointer" }}
          >
            <LogOut size={14} color="#EF4444" />
            <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 500 }}>Log Out</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ height: 52, background: "white", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
            <Menu size={17} color="#64748B" />
          </button>
          {activeScreen !== "admin-dashboard" && (
            <button
              onClick={() => {
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
                if (idx > 0) navigate(-1);
                else onNavigate("admin-dashboard");
              }}
              aria-label="Go back"
              title="Go back"
              style={{ border: "none", background: "#F1F5F9", borderRadius: 8, cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <ArrowLeft size={17} color="#334155" />
            </button>
          )}
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", flex: 1, margin: 0 }}>{title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F1F5F9", borderRadius: 8, padding: "6px 12px", width: 180 }}>
            <Search size={13} color="#94A3B8" />
            <input placeholder="Search..." style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "#374151", width: "100%" }} />
          </div>
          <button style={{ border: "none", background: "none", cursor: "pointer", position: "relative" }}>
            <Bell size={17} color="#64748B" />
            <div style={{ width: 7, height: 7, borderRadius: 4, background: "#EF4444", position: "absolute", top: 0, right: 0 }} />
          </button>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #FF6B35, #E05A2B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>AK</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Shared admin components ───────────────────────────────────────────────────

export function StatCard({
  label, value, sub, color = "#FF6B35", icon,
}: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div style={{ background: "white", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function AdminTable({
  columns, rows, onRowClick,
}: {
  columns: string[];
  rows: (string | React.ReactNode)[][];
  onRowClick?: (i: number) => void;
}) {
  return (
    <div style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            {columns.map((col) => (
              <th key={col} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(i)}
              style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F5F9" : "none", cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={(e) => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = "#F8FAFC"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
            >
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "11px 14px", fontSize: 12, color: "#374151" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { bg: string; color: string }> = {
    active:    { bg: "#F0FDF4", color: "#10B981" },
    approved:  { bg: "#F0FDF4", color: "#10B981" },
    verified:  { bg: "#F0FDF4", color: "#10B981" },
    completed: { bg: "#FFF0E8", color: "#FF6B35" },
    paid:      { bg: "#F0FDF4", color: "#10B981" },
    pending:   { bg: "#FFF7ED", color: "#F59E0B" },
    offered:   { bg: "#F5F3FF", color: "#8B5CF6" },
    upcoming:  { bg: "#F5F3FF", color: "#8B5CF6" },
    rejected:  { bg: "#FEF2F2", color: "#EF4444" },
    overdue:   { bg: "#FEF2F2", color: "#EF4444" },
    failed:    { bg: "#FEF2F2", color: "#EF4444" },
    blocked:   { bg: "#FEF2F2", color: "#EF4444" },
    low:       { bg: "#F0FDF4", color: "#10B981" },
    medium:    { bg: "#FFF7ED", color: "#F59E0B" },
    high:      { bg: "#FEF2F2", color: "#EF4444" },
  };
  const s = MAP[status.toLowerCase()] ?? { bg: "#F1F5F9", color: "#64748B" };
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

export function AdminPageHeader({
  title, subtitle, action,
}: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function AdminCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9", ...style }}>
      {children}
    </div>
  );
}
