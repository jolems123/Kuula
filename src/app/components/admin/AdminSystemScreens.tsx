/**
 * Admin → Administration: staff accounts, audit log, and the read-only view of
 * what the server is actually configured with. There are no "settings" forms
 * here because pricing and provider credentials are environment-driven;
 * showing them as editable would be dishonest.
 */
import { useState } from "react";
import { Plus, UserX, UserCheck, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { AdminStaff } from "../../api/admin-types";
import {
  useAdminQuery, AsyncState, Pagination, SearchInput, useDebounced, FilterTabs,
  fmtDateTime, relativeTime, ugx, Btn, Field, TwoCol, SectionTitle,
  ConfirmDialog, useAction, InlineError, SuccessNote, Modal, Labeled, inputStyle,
} from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

// ── Staff ─────────────────────────────────────────────────────────────────────

function StaffModal({ existing, onClose, onDone }: { existing: AdminStaff | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { state } = useAppContext();
  const token = state.session.token!;
  const [form, setForm] = useState({ fullName: existing?.fullName ?? "", email: existing?.email ?? "", password: "" });
  const action = useAction();
  const save = () =>
    action.run(
      () => existing ? api.admin.updateStaff(token, existing.id, { fullName: form.fullName }) : api.admin.createStaff(token, form),
      () => { onDone(existing ? "Staff member updated." : `Staff account created for ${form.email}. Share the password securely; they can sign in at the admin portal.`); onClose(); }
    );
  const valid = form.fullName.trim().length >= 2 && (existing || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.password.length >= 10));
  return (
    <Modal title={existing ? "Edit staff member" : "Add staff member"} onClose={onClose}>
      <Labeled label="Full name"><input style={inputStyle} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Labeled>
      <Labeled label="Email (login)" hint={existing ? "The email is the login identity and cannot be changed." : undefined}>
        <input style={inputStyle} type="email" value={form.email} disabled={!!existing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Labeled>
      {!existing && (
        <Labeled label="Temporary password" hint="At least 10 characters. Ask them to change it after first sign-in.">
          <input style={inputStyle} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Labeled>
      )}
      <p style={{ fontSize: 11, color: "#94A3B8" }}>Staff accounts have full admin access. Customers can never be promoted to staff, and staff accounts are separate from customer accounts.</p>
      <InlineError message={action.error} onDismiss={action.clearError} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="secondary" onClick={onClose} disabled={action.busy}>Cancel</Btn>
        <Btn onClick={save} disabled={action.busy || !valid}>{action.busy ? "Saving…" : existing ? "Save" : "Create account"}</Btn>
      </div>
    </Modal>
  );
}

export function AdminStaffManagementScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const list = useAdminQuery(token ? () => api.admin.staff(token) : null, [token]);
  const action = useAction();
  const [modal, setModal] = useState<null | { kind: "create" } | { kind: "edit"; s: AdminStaff } | { kind: "deactivate"; s: AdminStaff } | { kind: "reactivate"; s: AdminStaff }>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async (s: AdminStaff, kind: "deactivate" | "reactivate", reason: string) => {
    if (!token) return;
    const r = await action.run(() => kind === "deactivate" ? api.admin.deactivateStaff(token, s.id, reason) : api.admin.reactivateStaff(token, s.id));
    if (r) { setModal(null); setNote(kind === "deactivate" ? `${s.fullName} can no longer sign in.` : `${s.fullName} reactivated.`); list.reload(); }
  };

  return (
    <AdminLayout activeScreen="admin-staff" onNavigate={onNavigate} title="Staff">
      <AdminPageHeader title="Staff" subtitle="Accounts that can sign in to this portal" action={<Btn onClick={() => setModal({ kind: "create" })}><Plus size={14} /> Add staff</Btn>} />
      <SuccessNote message={note} />
      <AsyncState state={list} isEmpty={(d) => d.staff.length === 0} emptyTitle="No staff accounts">
        {(d) => (
          <AdminTable columns={["Name", "Email", "Role", "Last sign-in", "Status", "Actions"]}
            rows={d.staff.map((s) => [
              <span key="n" style={{ fontWeight: 600 }}>{s.fullName || "—"}{s.isSelf && <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>(you)</span>}</span>,
              s.email ?? "—",
              <StatusBadge key="r" status="approved" label={s.role} />,
              s.lastLoginAt ? relativeTime(s.lastLoginAt) : "Never",
              <StatusBadge key="s" status={s.active ? "active" : "deactivated"} />,
              <div key="a" style={{ display: "flex", gap: 6 }}>
                <Btn small variant="secondary" onClick={() => setModal({ kind: "edit", s })}><Pencil size={12} /> Edit</Btn>
                {s.active
                  ? <Btn small variant="danger" disabled={s.isSelf} title={s.isSelf ? "You cannot deactivate your own account" : undefined} onClick={() => setModal({ kind: "deactivate", s })}><UserX size={12} /> Deactivate</Btn>
                  : <Btn small variant="success" onClick={() => setModal({ kind: "reactivate", s })}><UserCheck size={12} /> Reactivate</Btn>}
              </div>,
            ])} />
        )}
      </AsyncState>
      {modal?.kind === "create" && <StaffModal existing={null} onClose={() => setModal(null)} onDone={(m) => { setNote(m); list.reload(); }} />}
      {modal?.kind === "edit" && <StaffModal existing={modal.s} onClose={() => setModal(null)} onDone={(m) => { setNote(m); list.reload(); }} />}
      {modal?.kind === "deactivate" && (
        <ConfirmDialog title="Deactivate staff account" confirmLabel="Deactivate" requireReason={false} reasonLabel="Reason"
          message={<>Signs <strong>{modal.s.fullName}</strong> out everywhere and blocks future sign-ins. Their past actions remain in the audit log. The last active admin cannot be deactivated.</>}
          onConfirm={(r) => toggle(modal.s, "deactivate", r)} onClose={() => { setModal(null); action.clearError(); }} busy={action.busy} error={action.error} />
      )}
      {modal?.kind === "reactivate" && (
        <ConfirmDialog title="Reactivate staff account" variant="success" confirmLabel="Reactivate"
          message={<>Restores portal access for <strong>{modal.s.fullName}</strong>.</>}
          onConfirm={() => toggle(modal.s, "reactivate", "")} onClose={() => { setModal(null); action.clearError(); }} busy={action.busy} error={action.error} />
      )}
    </AdminLayout>
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

type AuditFilter = "all" | "loan." | "kyc." | "customer." | "ticket." | "staff." | "auth.";

export function AdminAuditLogScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(1);
  const dEntity = useDebounced(entityId);
  const list = useAdminQuery(token ? () => api.admin.audit(token, { action: filter === "all" ? undefined : filter, entityId: dEntity || undefined, page, pageSize: 50 }) : null, [token, filter, dEntity, page]);

  return (
    <AdminLayout activeScreen="admin-audit-log" onNavigate={onNavigate} title="Audit Log">
      <AdminPageHeader title="Audit Log" subtitle="Immutable record of staff and system actions" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
          options={[{ id: "all", label: "All" }, { id: "loan.", label: "Loans" }, { id: "kyc.", label: "KYC" }, { id: "customer.", label: "Customers" }, { id: "ticket.", label: "Tickets" }, { id: "staff.", label: "Staff" }, { id: "auth.", label: "Sign-ins" }]} />
        <SearchInput value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} placeholder="Filter by record id…" />
      </div>
      <AsyncState state={list} isEmpty={(d) => d.items.length === 0} emptyTitle="No audit events" emptyHint="Events are written when staff approve loans, review KYC, edit customers and more.">
        {(d) => (
          <>
            <AdminTable columns={["When", "Action", "By", "Record", "Details"]}
              rows={d.items.map((e) => [
                fmtDateTime(e.createdAt),
                <span key="a" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{e.action}</span>,
                e.actorName ?? (e.actorRole ? `${e.actorRole}` : "system"),
                <span key="r" style={{ fontSize: 11, color: "#64748B" }}>{e.entityType} · <span style={{ fontFamily: "ui-monospace, monospace" }}>{e.entityId.slice(0, 8)}</span></span>,
                <span key="m" style={{ fontSize: 11, color: "#64748B", maxWidth: 360, display: "inline-block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={JSON.stringify(e.metadata)}>
                  {Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : "—"}
                </span>,
              ])} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

// ── System configuration (read-only) ──────────────────────────────────────────

function Flag({ ok, yes = "Configured", no = "Not configured" }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: ok ? "var(--status-success)" : "var(--status-error)", fontWeight: 700 }}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {ok ? yes : no}
    </span>
  );
}

export function AdminSettingsScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const cfg = useAdminQuery(token ? () => api.admin.config(token) : null, [token]);

  return (
    <AdminLayout activeScreen="admin-settings" onNavigate={onNavigate} title="System">
      <AdminPageHeader title="System" subtitle="What this deployment is running with. Values are set in the server environment and cannot be edited from the portal." />
      <AsyncState state={cfg} emptyTitle="">
        {(c) => (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 16 }}>
              <StatCard label="Environment" value={c.environment} icon={<></>} />
              <StatCard label="Payments" value={c.providers.payments.configured ? c.providers.payments.name : "Off"} sub={c.providers.payments.configured ? "Payouts & collections live" : "Disbursement and repayment return 503"} color={c.providers.payments.configured ? "var(--status-success)" : "var(--status-error)"} icon={<></>} />
              <StatCard label="SMS" value={c.providers.sms.configured ? (c.providers.sms.provider ?? "On") : "Dev logger"} sub={c.providers.sms.configured ? `Sender ${c.providers.sms.senderId ?? ""}` : "OTPs are not delivered"} color={c.providers.sms.configured ? "var(--status-success)" : "#F59E0B"} icon={<></>} />
              <StatCard label="KYC check" value={c.providers.kyc.configured ? c.providers.kyc.name : "Manual"} sub={c.providers.kyc.configured ? c.providers.kyc.environment : "All submissions need staff review"} color={c.providers.kyc.configured ? "var(--status-success)" : "#F59E0B"} icon={<></>} />
            </div>
            <TwoCol>
              <AdminCard>
                <SectionTitle>Loan pricing</SectionTitle>
                <Field label="Maximum APR" value={`${c.pricing.maxAprPercent}%`} />
                <Field label="Minimum term" value={`${c.pricing.minTermDays} days`} />
                <Field label="Interest model" value={c.pricing.compound ? "Compound" : "Simple (amortised)"} />
                <Field label="Savings APR" value={`${c.pricing.savingsAprPercent}%`} />
                <Field label="Savings discount on loan APR" value={`${c.pricing.savingsDiscountPercent}% when balance ≥ ${ugx(c.pricing.savingsThreshold)}`} />
                <Field label="Data retention" value={`${c.pricing.dataRetentionYears} years`} />
                <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>Pricing is defined in code and applied identically in the app and on the server. Changing it is a release, not a setting.</p>
              </AdminCard>
              <AdminCard>
                <SectionTitle>Payment provider</SectionTitle>
                <Field label="Provider" value={c.providers.payments.name} />
                <Field label="Credentials" value={<Flag ok={c.providers.payments.configured} />} />
                <Field label="Callback signing" value={c.providers.payments.webhookMode.toUpperCase()} />
                <Field label="Re-verify callbacks with provider" value={<Flag ok={c.providers.payments.verifyCallbacks} yes="On" no="Off" />} />
                <Field label="Callback base URL" value={c.providers.payments.callbackBaseUrl ?? "—"} mono />
                <Field label="Last callback received" value={c.providers.payments.lastWebhookAt ? `${fmtDateTime(c.providers.payments.lastWebhookAt)} (${c.providers.payments.lastWebhookStatus})` : "None yet"} />
              </AdminCard>
              <AdminCard>
                <SectionTitle>Sessions &amp; OTP</SectionTitle>
                <Field label="Access token lifetime" value={c.auth.accessTokenTtl} />
                <Field label="Refresh token lifetime" value={`${c.auth.refreshTokenTtlDays} days`} />
                <Field label="OTP validity" value={`${Math.round(c.auth.otpTtlSeconds / 60)} minutes`} />
                <Field label="OTP attempts" value={c.auth.otpMaxAttempts} />
              </AdminCard>
              <AdminCard>
                <SectionTitle>Database</SectionTitle>
                <Field label="Latest migration" value={c.database.lastMigration ?? "—"} mono />
                <Field label="Applied" value={fmtDateTime(c.database.lastMigrationAt)} />
              </AdminCard>
            </TwoCol>
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}
