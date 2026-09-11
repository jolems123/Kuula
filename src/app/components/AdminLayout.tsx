import React, { useState } from "react";
import {
  LayoutDashboard, FileText, Users, PiggyBank, CreditCard,
  BarChart3, Settings, MessageSquare, ChevronDown, ChevronRight,
  LogOut, Menu, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import kuulaLogo from "/kuula-logo-dark.png";
import { useAppContext } from "../context/AppContext";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: { id: string; label: string }[];
}

/**
 * Every entry here is backed by a real API route; screens without a data
 * source were removed rather than shown with sample content.
 */
const NAV: NavItem[] = [
  { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "admin-loans", label: "Loans", icon: FileText,
    children: [
      { id: "admin-loan-apps",     label: "Applications" },
      { id: "admin-active-loans",  label: "Active Loans" },
      { id: "admin-overdue-loans", label: "Overdue" },
      { id: "admin-loan-history",  label: "History" },
    ],
  },
  {
    id: "admin-customers", label: "Customers", icon: Users,
    children: [
      { id: "admin-customer-list", label: "All Customers" },
      { id: "admin-customer-kyc",  label: "KYC Review" },
    ],
  },
  {
    id: "admin-savings", label: "Savings", icon: PiggyBank,
    children: [
      { id: "admin-all-savings",          label: "Accounts" },
      { id: "admin-savings-transactions", label: "Transactions" },
    ],
  },
  { id: "admin-all-transactions", label: "Transactions", icon: CreditCard },
  { id: "admin-reports", label: "Reports", icon: BarChart3 },
  {
    id: "admin-support", label: "Support", icon: MessageSquare,
    children: [
      { id: "admin-support-inbox", label: "Inbox" },
      { id: "admin-tickets",       label: "Tickets" },
    ],
  },
  {
    id: "admin-system", label: "Administration", icon: Settings,
    children: [
      { id: "admin-staff",     label: "Staff" },
      { id: "admin-audit-log", label: "Audit Log" },
      { id: "admin-settings",  label: "System" },
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
  const [expanded, setExpanded] = useState<string[]>(() => {
    const parent = NAV.find((n) => n.children?.some((c) => c.id === activeScreen));
    return parent ? [parent.id] : [];
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  const signOut = () => {
    // Ends the server session (refresh token) and clears local state.
    logout();
    navigate("/admin-login", { replace: true });
  };

  const toggle = (id: string) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div className="admin-layout" style={{ position: "relative", display: "flex", height: "100%", background: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {sidebarOpen && <button className="admin-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar */}
      <div className="admin-sidebar"
        style={{
          width: sidebarOpen ? 220 : 0,
          minWidth: sidebarOpen ? 220 : 0,
          background: "var(--brand-primary-dark)",
          display: sidebarOpen ? "flex" : "none",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s, min-width 0.2s",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
          <div style={{ padding: 8, borderRadius: 12, background: "white" }}>
            <img src={kuulaLogo} alt="Kuula" style={{ width: 164, maxWidth: "100%", height: "auto", objectFit: "contain" }} />
          </div>
          <p style={{ color: "#E8F5EC", fontSize: 14, marginTop: 8 }}>Admin Portal</p>
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
                  aria-expanded={item.children ? isExpanded : undefined}
                  aria-current={isActive && !item.children ? "page" : undefined}
                  onClick={() => {
                    if (item.children) toggle(item.id);
                    else { onNavigate(item.id); if (window.innerWidth < 768) setSidebarOpen(false); }
                  }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 14px", background: isActive && !item.children ? "rgba(11,107,58,0.15)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    borderLeft: isActive && !item.children ? "2px solid var(--brand-primary)" : "2px solid transparent",
                  }}
                >
                  <Icon size={18} color={isActive ? "var(--brand-accent)" : "#BEDDC9"} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? "#E2E8F0" : "#E8F5EC", flex: 1, whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                  {item.children && (
                    isExpanded
                      ? <ChevronDown size={12} color="#BEDDC9" />
                      : <ChevronRight size={12} color="#BEDDC9" />
                  )}
                </button>
                {item.children && isExpanded && (
                  <div style={{ paddingLeft: 38 }}>
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        aria-current={activeScreen === child.id ? "page" : undefined}
                        onClick={() => { onNavigate(child.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                        style={{
                          width: "100%", display: "block", padding: "7px 14px 7px 0",
                          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                          fontSize: 14, fontWeight: activeScreen === child.id ? 600 : 400,
                          color: activeScreen === child.id ? "var(--brand-accent)" : "#BEDDC9",
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
          {state.user && (
            <div style={{ padding: "4px 0 8px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E8F5EC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.user.fullName || state.user.email}</div>
              <div style={{ fontSize: 10, color: "#BEDDC9" }}>Signed in as staff</div>
            </div>
          )}
          <button
            onClick={signOut}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 0", background: "transparent", border: "none", cursor: "pointer" }}
          >
            <LogOut size={14} color="#EF4444" />
            <span style={{ fontSize: 14, color: "var(--status-error)", fontWeight: 500 }}>Log Out</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar */}
        <div className="admin-header" style={{ height: 52, background: "white", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0 }}>
          <button aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
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
          <button aria-label="Settings" onClick={() => onNavigate("admin-settings")} style={{ minWidth: 44, minHeight: 44, border: "none", background: "transparent", color: "var(--brand-primary)" }}><Settings size={20} /></button>
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
  label, value, sub, color = "var(--brand-primary)", icon, onClick,
}: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} style={{ background: "white", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9", flex: 1, minWidth: 0, textAlign: "left", cursor: onClick ? "pointer" : "default", font: "inherit" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `color-mix(in srgb, ${color} 8%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </Tag>
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
    <div className="admin-table" style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflowX: "auto" }}>
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

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const MAP: Record<string, { bg: string; color: string }> = {
    active:    { bg: "#F0FDF4", color: "var(--status-success)" },
    approved:  { bg: "#F0FDF4", color: "var(--status-success)" },
    verified:  { bg: "#F0FDF4", color: "var(--status-success)" },
    resolved:  { bg: "#F0FDF4", color: "var(--status-success)" },
    completed: { bg: "var(--brand-light)", color: "var(--brand-primary)" },
    paid:      { bg: "#F0FDF4", color: "var(--status-success)" },
    open:      { bg: "var(--brand-light)", color: "var(--brand-primary)" },
    pending:   { bg: "#FFF7ED", color: "var(--status-warning)" },
    resubmitted: { bg: "#FFF7ED", color: "var(--status-warning)" },
    scheduled: { bg: "#FFF7ED", color: "var(--status-warning)" },
    disbursing: { bg: "#F5F3FF", color: "#8B5CF6" },
    offered:   { bg: "#F5F3FF", color: "#8B5CF6" },
    upcoming:  { bg: "#F5F3FF", color: "#8B5CF6" },
    rejected:  { bg: "#FEF2F2", color: "var(--status-error)" },
    overdue:   { bg: "#FEF2F2", color: "var(--status-error)" },
    failed:    { bg: "#FEF2F2", color: "var(--status-error)" },
    disbursement_failed: { bg: "#FEF2F2", color: "var(--status-error)" },
    blocked:   { bg: "#FEF2F2", color: "var(--status-error)" },
    deactivated: { bg: "#F1F5F9", color: "#64748B" },
    closed:    { bg: "#F1F5F9", color: "#64748B" },
    not_submitted: { bg: "#F1F5F9", color: "#64748B" },
    low:       { bg: "#F0FDF4", color: "var(--status-success)" },
    medium:    { bg: "#FFF7ED", color: "var(--status-warning)" },
    high:      { bg: "#FEF2F2", color: "var(--status-error)" },
  };
  const s = MAP[status.toLowerCase()] ?? { bg: "#F1F5F9", color: "#64748B" };
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {label ?? status.replace(/_/g, " ")}
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
