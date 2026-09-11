/**
 * Shared building blocks for the admin portal: data-loading hook with
 * loading / error / empty states, pagination, filters, confirm dialogs and
 * formatters. Every data screen composes these so behaviour is consistent.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw, Search, X } from "lucide-react";
import { ApiError } from "../../api/client";

// ── Formatters ────────────────────────────────────────────────────────────────

export function ugx(n: number | null | undefined): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString("en-UG")}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8).toUpperCase() : "—";
}

export const LOAN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  resubmitted: "Resubmitted",
  offered: "Offer sent",
  disbursing: "Disbursing",
  active: "Active",
  paid: "Repaid",
  overdue: "Overdue",
  rejected: "Rejected",
  disbursement_failed: "Payout failed",
  failed: "Failed",
};

export const TX_TYPE_LABEL: Record<string, string> = {
  loan_disbursement: "Loan payout",
  loan_payment: "Loan repayment",
  savings_deposit: "Savings deposit",
  savings_withdrawal: "Savings withdrawal",
};

// ── URL helpers ───────────────────────────────────────────────────────────────

/** Reads `?key=` from the current hash route (`#/admin-x?id=…`). */
export function useQueryParam(key: string): string | null {
  const location = useLocation();
  return new URLSearchParams(location.search).get(key);
}

export function withId(screen: string, id: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ id, ...(extra ?? {}) });
  return `${screen}?${p.toString()}`;
}

// ── Data loading ──────────────────────────────────────────────────────────────

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Your session has expired. Please sign in again.";
    if (e.status === 403) return "You do not have permission to view this.";
    if (e.status === 404) return "Not found.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * Runs `fn` whenever `deps` change. Keeps the last good data while reloading
 * so lists do not flash empty, and surfaces a retryable error.
 */
export function useAdminQuery<T>(fn: (() => Promise<T>) | null, deps: unknown[], opts: { pollMs?: number } = {}): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!fn);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const current = fnRef.current;
    if (!current) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    current()
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(messageOf(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!opts.pollMs || !fnRef.current) return;
    const t = setInterval(() => {
      fnRef.current?.().then((d) => setData(d)).catch(() => {/* keep last good data on transient errors */});
    }, opts.pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.pollMs, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/** Wraps a mutating call: tracks busy + error, refreshes on success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, after?: (result: T) => void): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      after?.(r);
      return r;
    } catch (e) {
      setError(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

// ── State components ──────────────────────────────────────────────────────────

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: 13 }}>
      <div style={{ width: 24, height: 24, margin: "0 auto 10px", border: "3px solid #E5E7EB", borderTopColor: "var(--brand-primary)", borderRadius: "50%", animation: "kuula-spin 0.7s linear infinite" }} />
      {label}
      <style>{`@keyframes kuula-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ textAlign: "center", padding: "36px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12 }}>
      <AlertTriangle size={24} color="#EF4444" style={{ margin: "0 auto 8px" }} />
      <p style={{ fontSize: 13, color: "#991B1B", margin: "0 0 12px", fontWeight: 600 }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #FECACA", background: "white", color: "#991B1B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 16px", background: "white", border: "1px dashed #E2E8F0", borderRadius: 12 }}>
      <Inbox size={26} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: "#334155", margin: 0 }}>{title}</p>
      {hint && <p style={{ fontSize: 12, color: "#94A3B8", margin: "4px 0 0" }}>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/** Renders loading → error → empty → children in that order. */
export function AsyncState<T>({
  state, isEmpty, emptyTitle, emptyHint, emptyAction, children,
}: {
  state: QueryState<T>;
  isEmpty?: (d: T) => boolean;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading && state.data === null) return <LoadingState />;
  if (state.error && state.data === null) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <LoadingState />;
  if (isEmpty ? isEmpty(state.data) : false) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  return (
    <div style={{ position: "relative" }}>
      {state.error && (
        <div role="alert" style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#FEF2F2", color: "#991B1B", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Could not refresh: {state.error}</span>
          <button onClick={state.reload} style={{ border: "none", background: "none", color: "#991B1B", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Retry</button>
        </div>
      )}
      {children(state.data)}
    </div>
  );
}

export function InlineError({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ margin: "10px 0", padding: "8px 12px", borderRadius: 8, background: "#FEF2F2", color: "#991B1B", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span>{message}</span>
      {onDismiss && <button aria-label="Dismiss" onClick={onDismiss} style={{ border: "none", background: "none", cursor: "pointer", color: "#991B1B" }}><X size={14} /></button>}
    </div>
  );
}

export function SuccessNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" style={{ margin: "10px 0", padding: "8px 12px", borderRadius: 8, background: "#F0FDF4", color: "#166534", fontSize: 12, fontWeight: 600 }}>
      {message}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function SearchInput({ value, onChange, placeholder = "Search…", width = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", borderRadius: 8, padding: "6px 12px", border: "1px solid #E2E8F0", width, maxWidth: "100%" }}>
      <Search size={14} color="#94A3B8" />
      <input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ border: "none", outline: "none", fontSize: 13, color: "#374151", flex: 1, background: "transparent", minWidth: 0 }} />
      {value && <button aria-label="Clear search" onClick={() => onChange("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}><X size={13} /></button>}
    </div>
  );
}

/** Debounces a value so list searches do not fire on every keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FilterTabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} role="tab" aria-selected={active} onClick={() => onChange(o.id)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", borderColor: active ? "var(--brand-primary)" : "#E2E8F0", background: active ? "var(--brand-primary)" : "white", color: active ? "white" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {o.label}
            {o.count !== undefined && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: active ? "rgba(255,255,255,0.25)" : "#F1F5F9", color: active ? "white" : "#475569" }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12, color: "#64748B" }}>
      <span>Showing {from}–{to} of {total.toLocaleString()}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={pagerBtn(page <= 1)}><ChevronLeft size={14} /></button>
        <span style={{ fontWeight: 600, color: "#334155" }}>Page {page} of {pages}</span>
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} style={pagerBtn(page >= pages)}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, color: "#334155" };
}

export function Btn({ children, onClick, variant = "primary", disabled, type = "button", small, title }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  disabled?: boolean; type?: "button" | "submit"; small?: boolean; title?: string;
}) {
  const palette: Record<string, React.CSSProperties> = {
    primary: { background: "var(--brand-primary)", color: "white", border: "1px solid var(--brand-primary)" },
    success: { background: "var(--status-success)", color: "white", border: "1px solid var(--status-success)" },
    secondary: { background: "white", color: "#334155", border: "1px solid #E2E8F0" },
    danger: { background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" },
    ghost: { background: "transparent", color: "var(--brand-primary)", border: "1px solid transparent" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      style={{ ...palette[variant], padding: small ? "5px 10px" : "8px 14px", borderRadius: 8, fontSize: small ? 11 : 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

export function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F1F5F9", fontSize: 12 }}>
      <span style={{ color: "#64748B", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#0F172A", fontWeight: 600, textAlign: "right", wordBreak: "break-word", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>{value ?? "—"}</span>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>{children}</h3>
      {action}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 8, border: "1.5px solid #E5E7EB", padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", background: "white", color: "#0F172A",
};

export function Labeled({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: width, boxShadow: "0 24px 60px rgba(15,23,42,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #F1F5F9" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{title}</h3>
          <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#64748B", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Confirmation for a destructive or irreversible action. When `requireReason`
 * is set the confirm button stays disabled until a reason is typed — the
 * reason is recorded in the audit trail server-side.
 */
export function ConfirmDialog({
  title, message, confirmLabel = "Confirm", variant = "danger", requireReason, reasonLabel = "Reason", onConfirm, onClose, busy, error,
}: {
  title: string; message: React.ReactNode; confirmLabel?: string; variant?: "danger" | "primary" | "success";
  requireReason?: boolean; reasonLabel?: string;
  onConfirm: (reason: string) => void; onClose: () => void; busy?: boolean; error?: string | null;
}) {
  const [reason, setReason] = useState("");
  const disabled = busy || (requireReason && reason.trim().length < 3);
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{message}</div>
      {requireReason !== undefined && (
        <div style={{ marginTop: 14 }}>
          <Labeled label={requireReason ? `${reasonLabel} (required)` : `${reasonLabel} (optional)`}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Labeled>
        </div>
      )}
      <InlineError message={error ?? null} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn variant={variant} onClick={() => onConfirm(reason.trim())} disabled={disabled}>{busy ? "Working…" : confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

export function KeyValueGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>{children}</div>;
}

export function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>{children}</div>;
}
