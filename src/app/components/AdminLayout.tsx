import React, { useEffect, useState } from "react";
import {
  LayoutDashboard, ClipboardCheck, FileText, Users, Building2, Landmark,
  BarChart3, Settings, MessageSquare, ChevronDown,
  Bell, LogOut, Search, Menu, ArrowLeft, X, type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAppContext } from "../context/AppContext";
import { KuulaLogo } from "./brand/KuulaLogo";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: { id: string; label: string }[];
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

const NAV: NavSection[] = [
  { label: null, items: [{ id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Credit",
    items: [
      {
        id: "admin-credit-operations", label: "Credit operations", icon: ClipboardCheck,
        children: [
          { id: "admin-officer-dashboard", label: "My review queue" },
          { id: "admin-officer-assignment", label: "Intake & assignment" },
          { id: "admin-approval-workflow", label: "Approval workflow" },
          { id: "admin-officer-contact", label: "Customer search" },
        ],
      },
      {
        id: "admin-loans", label: "Facilities", icon: FileText,
        children: [
          { id: "admin-loan-apps", label: "Applications" },
          { id: "admin-active-loans", label: "Active facilities" },
          { id: "admin-overdue-loans", label: "Overdue" },
          { id: "admin-loan-history", label: "History" },
        ],
      },
      {
        id: "admin-customers", label: "Customers", icon: Users,
        children: [
          { id: "admin-customer-list", label: "All customers" },
          { id: "admin-customer-kyc", label: "KYC verification" },
        ],
      },
      { id: "admin-partner-financing", label: "Partner financing", icon: Building2 },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "admin-reports", label: "Reports", icon: BarChart3 },
      { id: "admin-reconciliation", label: "Reconciliation", icon: Landmark },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "admin-support", label: "Support", icon: MessageSquare, children: [{ id: "admin-support-inbox", label: "Support inbox" }] },
      { id: "admin-settings", label: "Settings", icon: Settings, children: [{ id: "admin-staff", label: "Staff management" }] },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin", administrator: "Administrator", admin: "Administrator", credit_manager: "Credit manager",
  final_approver: "Final approver", loan_officer: "Loan officer", officer: "Loan officer", manager: "Manager",
  collections: "Collections", finance: "Finance", support: "Support", kyc_officer: "KYC officer",
};

function initials(name: string | undefined) {
  const parts = (name || "Kuula Staff").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "K") + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface AdminLayoutProps {
  children: React.ReactNode;
  activeScreen: string;
  onNavigate: (screen: string) => void;
  title: string;
}

export function AdminLayout({ children, activeScreen, onNavigate, title }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { state, logout } = useAppContext();
  const role = state.role || "";
  const activeParent = NAV.flatMap((s) => s.items).find((item) => item.children?.some((c) => c.id === activeScreen))?.id;
  const [expanded, setExpanded] = useState<string[]>(() => [activeParent ?? "admin-credit-operations"]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [activeScreen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const toggle = (id: string) => setExpanded((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const can = (item: NavItem) => {
    if (item.id === "admin-dashboard") return ["super_admin", "administrator", "admin"].includes(role);
    if (item.id === "admin-credit-operations") return ["super_admin", "administrator", "credit_manager", "final_approver", "loan_officer", "admin", "manager", "officer"].includes(role);
    if (item.id === "admin-loans") return ["super_admin", "administrator", "credit_manager", "final_approver", "loan_officer", "collections", "admin", "manager", "officer"].includes(role);
    if (item.id === "admin-customers") return true;
    if (item.id === "admin-partner-financing") return ["super_admin", "administrator", "admin"].includes(role);
    if (item.id === "admin-reports") return ["super_admin", "administrator", "credit_manager", "final_approver", "finance", "admin", "manager"].includes(role);
    if (item.id === "admin-reconciliation") return ["super_admin", "administrator", "finance", "admin"].includes(role);
    if (item.id === "admin-settings") return role === "super_admin";
    if (item.id === "admin-support") return ["super_admin", "administrator", "credit_manager", "loan_officer", "collections", "support", "admin", "manager", "officer"].includes(role);
    return false;
  };
  const canChild = (id: string) => {
    if (id === "admin-customer-kyc") return ["super_admin", "administrator", "admin", "credit_manager", "manager", "kyc_officer"].includes(role);
    if (id === "admin-officer-assignment" || id === "admin-approval-workflow") return ["super_admin", "administrator", "admin", "credit_manager", "manager"].includes(role);
    if (id === "admin-overdue-loans") return ["super_admin", "administrator", "admin", "credit_manager", "manager", "collections"].includes(role);
    return true;
  };
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter(can) })).filter((s) => s.items.length > 0);
  const canSearch = ["super_admin", "administrator", "admin", "credit_manager", "final_approver", "loan_officer", "manager", "officer"].includes(role);
  const signOut = () => { logout(); navigate("/admin-login", { replace: true }); };
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else onNavigate("admin-dashboard");
  };

  return (
    <div className={`kx kx-admin${drawerOpen ? " is-drawer-open" : ""}`}>
      <div className="kx-admin__scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <nav className="kx-sidebar" aria-label="Staff navigation">
        <div className="kx-sidebar__brand">
          <KuulaLogo tone="light" size={32} subtitle="Staff portal" />
          <button type="button" className="kx-sidebar__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="kx-sidebar__nav">
          {sections.map((section) => (
            <div key={section.label ?? "main"} className="kx-sidebar__section">
              {section.label && <p className="kx-sidebar__label">{section.label}</p>}
              {section.items.map((item) => {
                const Icon = item.icon;
                const childActive = item.children?.some((c) => c.id === activeScreen);
                const open = expanded.includes(item.id) || !!childActive;
                if (!item.children) {
                  return (
                    <button key={item.id} type="button" className={`kx-nav-item${activeScreen === item.id ? " is-active" : ""}`} aria-current={activeScreen === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
                      <Icon size={18} strokeWidth={1.75} /><span>{item.label}</span>
                    </button>
                  );
                }
                return (
                  <div key={item.id}>
                    <button type="button" className={`kx-nav-item${childActive ? " is-parent-active" : ""}`} aria-expanded={open} onClick={() => toggle(item.id)}>
                      <Icon size={18} strokeWidth={1.75} /><span>{item.label}</span>
                      <ChevronDown size={15} className={`kx-nav-item__chevron${open ? " is-open" : ""}`} />
                    </button>
                    {open && (
                      <div className="kx-nav-children">
                        {item.children.filter((c) => canChild(c.id)).map((child) => (
                          <button key={child.id} type="button" className={`kx-nav-child${activeScreen === child.id ? " is-active" : ""}`} aria-current={activeScreen === child.id ? "page" : undefined} onClick={() => onNavigate(child.id)}>
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="kx-sidebar__me">
          <span className="kx-avatar">{initials(state.user?.fullName)}</span>
          <div className="kx-sidebar__who">
            <strong>{state.user?.fullName || "Kuula staff"}</strong>
            <span>{ROLE_LABELS[role] ?? "Staff"}</span>
          </div>
          <button type="button" className="kx-sidebar__logout" onClick={signOut} aria-label="Log out" title="Log out"><LogOut size={17} strokeWidth={1.75} /></button>
        </div>
      </nav>

      <div className="kx-admin__main">
        <header className="kx-topbar">
          <button type="button" className="kx-icon-btn kx-topbar__menu" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu size={18} strokeWidth={1.75} /></button>
          {activeScreen !== "admin-dashboard" && (
            <button type="button" className="kx-icon-btn" onClick={goBack} aria-label="Go back"><ArrowLeft size={18} strokeWidth={1.75} /></button>
          )}
          <h1 className="kx-topbar__title">{title}</h1>
          <div className="kx-topbar__actions">
            {canSearch && (
              <button type="button" className="kx-search" onClick={() => onNavigate("admin-officer-contact")}>
                <Search size={16} strokeWidth={1.75} /><span>Search customers</span>
              </button>
            )}
            <button type="button" className="kx-icon-btn" aria-label="Notifications"><Bell size={18} strokeWidth={1.75} /></button>
          </div>
        </header>
        <main className="kx-admin__content">{children}</main>
      </div>
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info";

// Callers still pass legacy hex colours; map them onto the four status tones.
const TONE_BY_COLOR: Record<string, Tone> = {
  "#f59e0b": "warn", "#b45309": "warn", "#d97706": "warn",
  "#ef4444": "bad", "#dc2626": "bad", "#b91c1c": "bad",
  "#2563eb": "info", "#3b82f6": "info", "#8b5cf6": "info", "#7c3aed": "info",
};

export function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  const tone = TONE_BY_COLOR[(color ?? "").toLowerCase()] ?? "neutral";
  const hasIcon = React.isValidElement(icon) && icon.type !== React.Fragment;
  return (
    <div className={`kx-stat kx-stat--${tone}`}>
      <div className="kx-stat__head">
        <span className="kx-stat__label">{label}</span>
        {hasIcon && <span className="kx-stat__icon">{icon}</span>}
      </div>
      <div className="kx-stat__value">{value}</div>
      {sub && <div className="kx-stat__sub">{sub}</div>}
    </div>
  );
}

export function AdminTable({ columns, rows, onRowClick }: { columns: string[]; rows: (string | React.ReactNode)[][]; onRowClick?: (i: number) => void }) {
  return (
    <div className="kx-table-wrap">
      <table className="kx-table">
        <thead><tr>{columns.map((col) => <th key={col} scope="col">{col}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(i) : undefined} className={onRowClick ? "is-clickable" : undefined}>
              {row.map((cell, j) => <td key={j} data-label={columns[j]}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  active: "ok", approved: "ok", verified: "ok", paid: "ok", ready_for_offer: "ok", low: "ok", final_review: "ok", completed: "ok", disbursed: "ok", resolved: "ok",
  pending: "warn", medium: "warn", returned_for_clarification: "warn", submitted: "warn", open: "warn", in_progress: "warn",
  field_evaluation: "info", level2_review: "info", offered: "info", under_review: "info", in_review: "info",
  rejected: "bad", overdue: "bad", failed: "bad", blocked: "bad", high: "bad", defaulted: "bad", cancelled: "bad",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status.toLowerCase()] ?? "neutral";
  return <span className={`kx-badge kx-badge--${tone}`}>{status.replaceAll("_", " ")}</span>;
}

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="kx-page-head">
      <div className="kx-page-head__text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="kx-page-head__actions">{action}</div>}
    </div>
  );
}

export function AdminCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="kx-panel" style={style}>{children}</div>;
}
