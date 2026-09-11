/**
 * Admin → Customers and KYC review.
 *
 * Customers are never deleted from the portal: deactivation blocks sign-in and
 * keeps every financial record. KYC decisions write to the same columns the
 * customer app reads, so both surfaces always agree.
 */
import { useState } from "react";
import { Download, Pencil, UserX, UserCheck, ShieldCheck, ShieldX, LifeBuoy } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { downloadCsv } from "../../lib/export";
import type { AdminCustomerDetail } from "../../api/admin-types";
import {
  useAdminQuery, AsyncState, Pagination, SearchInput, FilterTabs, useDebounced, useQueryParam, withId,
  ugx, fmtDate, fmtDateTime, shortId, LOAN_STATUS_LABEL, TX_TYPE_LABEL, Btn, Field, TwoCol, SectionTitle,
  ConfirmDialog, useAction, InlineError, SuccessNote, Modal, Labeled, inputStyle, ErrorState, LoadingState,
} from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

const KYC_LABEL: Record<string, string> = { verified: "Verified", pending: "Awaiting review", rejected: "Rejected", not_submitted: "Not submitted" };

// ── List ──────────────────────────────────────────────────────────────────────

type CustomerFilter = "all" | "active" | "deactivated" | "verified" | "unverified";

export function AdminCustomerListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const list = useAdminQuery(token ? () => api.admin.customers(token, { q: dq, status: filter, page, pageSize: 25 }) : null, [token, dq, filter, page]);

  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Customers">
      <AdminPageHeader title="Customers" subtitle={list.data ? `${list.data.total.toLocaleString()} ${filter === "all" ? "registered" : filter} customers` : "Loading…"}
        action={<Btn variant="secondary" disabled={!list.data || list.data.items.length === 0}
          onClick={() => downloadCsv("kuula-customers", ["Name", "Phone", "Email", "KYC", "Loans", "Repaid", "Status", "Joined"],
            (list.data?.items ?? []).map((c) => [c.fullName, c.phone ?? "", c.email ?? "", KYC_LABEL[c.kycStatus], c.loansTotal, c.loansRepaid, c.active ? "Active" : "Deactivated", fmtDate(c.createdAt)]))}>
          <Download size={14} /> Export page (CSV)</Btn>} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
          options={[{ id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "verified", label: "KYC verified" }, { id: "unverified", label: "Not verified" }, { id: "deactivated", label: "Deactivated" }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, phone, email, NIN…" />
      </div>

      <AsyncState state={list} isEmpty={(d) => d.items.length === 0}
        emptyTitle={dq ? `No customers match "${dq}"` : "No registered customers yet"} emptyHint={dq ? undefined : "Customers appear here after signing up in the app."}>
        {(d) => (
          <>
            <AdminTable columns={["Name", "Phone", "KYC", "Loans", "Joined", "Account"]}
              rows={d.items.map((c) => [
                <div key="n"><div style={{ fontWeight: 600 }}>{c.fullName || "—"}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{c.email ?? ""}</div></div>,
                c.phone ?? "—",
                <StatusBadge key="k" status={c.kycStatus} label={KYC_LABEL[c.kycStatus]} />,
                `${c.loansRepaid}/${c.loansTotal} repaid`,
                fmtDate(c.createdAt),
                <StatusBadge key="a" status={c.active ? "active" : "deactivated"} />,
              ])}
              onRowClick={(i) => onNavigate(withId("admin-customer-detail", d.items[i].id))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

function EditCustomerModal({ detail, onClose, onSaved }: { detail: AdminCustomerDetail; onClose: () => void; onSaved: (msg: string) => void }) {
  const { state } = useAppContext();
  const token = state.session.token!;
  const c = detail.customer;
  const [form, setForm] = useState({ fullName: c.fullName, email: c.email ?? "", district: c.district ?? "", occupation: c.occupation ?? "" });
  const action = useAction();

  const save = () =>
    action.run(() => api.admin.updateCustomer(token, c.id, form), (r) => {
      onSaved(r.changed.length ? `Updated ${r.changed.join(", ")}.` : "No changes to save.");
      onClose();
    });

  return (
    <Modal title="Edit customer details" onClose={onClose}>
      <p style={{ fontSize: 12, color: "#64748B", marginTop: 0 }}>Only contact and profile fields can be edited. Phone number and national ID are identity fields and cannot be changed here. Every change is recorded in the audit log.</p>
      <Labeled label="Full name"><input style={inputStyle} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Labeled>
      <Labeled label="Email"><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Labeled>
      <Labeled label="District"><input style={inputStyle} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Labeled>
      <Labeled label="Occupation"><input style={inputStyle} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></Labeled>
      <InlineError message={action.error} onDismiss={action.clearError} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="secondary" onClick={onClose} disabled={action.busy}>Cancel</Btn>
        <Btn onClick={save} disabled={action.busy || form.fullName.trim().length < 2}>{action.busy ? "Saving…" : "Save changes"}</Btn>
      </div>
    </Modal>
  );
}

function NewTicketModal({ customerId, customerName, onClose, onCreated }: { customerId: string; customerName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { state } = useAppContext();
  const token = state.session.token!;
  const [form, setForm] = useState({ subject: "", category: "other", priority: "medium", body: "" });
  const action = useAction();
  const submit = () => action.run(() => api.admin.createTicket(token, { customerId, ...form }), (r) => onCreated(r.ticket.id));
  return (
    <Modal title={`New support ticket · ${customerName}`} onClose={onClose}>
      <Labeled label="Subject"><input style={inputStyle} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short summary of the issue" /></Labeled>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Labeled label="Category">
          <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {["loans", "repayments", "payments", "kyc", "savings", "account", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Labeled>
        <Labeled label="Priority">
          <select style={inputStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {["low", "medium", "high"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Labeled>
      </div>
      <Labeled label="First note (optional)"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Labeled>
      <InlineError message={action.error} onDismiss={action.clearError} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="secondary" onClick={onClose} disabled={action.busy}>Cancel</Btn>
        <Btn onClick={submit} disabled={action.busy || form.subject.trim().length < 3}>{action.busy ? "Creating…" : "Create ticket"}</Btn>
      </div>
    </Modal>
  );
}

export function AdminCustomerDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const id = useQueryParam("id");
  const detail = useAdminQuery(token && id ? () => api.admin.customer(token, id) : null, [token, id]);
  const action = useAction();
  const [modal, setModal] = useState<null | "edit" | "deactivate" | "reactivate" | "ticket">(null);
  const [note, setNote] = useState<string | null>(null);

  if (!id) {
    return <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Customer"><ErrorState message="No customer selected." onRetry={() => onNavigate("admin-customer-list")} /></AdminLayout>;
  }

  const toggleActive = async (kind: "deactivate" | "reactivate", reason: string) => {
    if (!token) return;
    const r = await action.run(() => kind === "deactivate" ? api.admin.deactivateCustomer(token, id, reason) : api.admin.reactivateCustomer(token, id, reason));
    if (r) { setModal(null); setNote(kind === "deactivate" ? "Account deactivated. The customer can no longer sign in; all records are retained." : "Account reactivated."); detail.reload(); }
  };

  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Customer">
      {detail.loading && !detail.data ? <LoadingState /> : detail.error && !detail.data ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (() => {
        const d = detail.data;
        const c = d.customer;
        return (
          <>
            <AdminPageHeader title={c.fullName || "Unnamed customer"} subtitle={`${c.phone ?? "No phone"} · customer since ${fmtDate(c.createdAt)} · ${shortId(c.id)}`}
              action={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatusBadge status={c.active ? "active" : "deactivated"} />
                  <Btn variant="secondary" onClick={() => setModal("edit")}><Pencil size={14} /> Edit</Btn>
                  <Btn variant="secondary" onClick={() => setModal("ticket")}><LifeBuoy size={14} /> New ticket</Btn>
                  {c.kycStatus !== "not_submitted" && <Btn variant="secondary" onClick={() => onNavigate(withId("admin-kyc-detail", c.id))}><ShieldCheck size={14} /> KYC</Btn>}
                  {c.active
                    ? <Btn variant="danger" onClick={() => setModal("deactivate")} disabled={d.hasLiveLoan} title={d.hasLiveLoan ? "Cannot deactivate while a loan is live" : undefined}><UserX size={14} /> Deactivate</Btn>
                    : <Btn variant="success" onClick={() => setModal("reactivate")}><UserCheck size={14} /> Reactivate</Btn>}
                </div>
              } />
            <SuccessNote message={note} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
              <StatCard label="KYC" value={KYC_LABEL[c.kycStatus]} sub={c.kycSubmittedAt ? `Submitted ${fmtDate(c.kycSubmittedAt)}` : "Nothing submitted"} color={c.kycStatus === "verified" ? "var(--status-success)" : "#F59E0B"} icon={<></>} />
              <StatCard label="Credit score" value={`${d.credit.score}`} sub={`${d.credit.tier} · computed now`} color="#8B5CF6" icon={<></>} />
              <StatCard label="Loans" value={`${c.loansRepaid}/${c.loansTotal}`} sub="Repaid / total" color="var(--brand-primary)" icon={<></>} />
              <StatCard label="Savings balance" value={d.savings ? ugx(d.savings.balance) : "—"} sub={d.savings ? (d.savings.reconciled ? "Matches ledger" : `Ledger shows ${ugx(d.savings.ledgerBalance)}`) : "No savings account"} color={d.savings && !d.savings.reconciled ? "var(--status-error)" : "#0EA5E9"} icon={<></>} />
            </div>

            <TwoCol>
              <AdminCard>
                <SectionTitle>Profile</SectionTitle>
                <Field label="Full name" value={c.fullName} />
                <Field label="Phone" value={<>{c.phone ?? "—"} {c.phoneVerified && <StatusBadge status="verified" label="verified" />}</>} />
                <Field label="Email" value={c.email ?? "—"} />
                <Field label="National ID" value={c.nationalId ?? "—"} mono />
                <Field label="District" value={c.district || "—"} />
                <Field label="Occupation" value={c.occupation || "—"} />
                <Field label="Terms accepted" value={c.termsAcceptedAt ? `${fmtDateTime(c.termsAcceptedAt)}${c.termsVersion ? ` (v${c.termsVersion})` : ""}` : "—"} />
                <Field label="Account status" value={c.active ? "Active" : `Deactivated ${fmtDateTime(c.deactivatedAt)}`} />
              </AdminCard>
              <AdminCard>
                <SectionTitle>Credit factors</SectionTitle>
                {d.credit.factors.map((f) => (
                  <div key={f.key} style={{ padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: "#0F172A" }}>{f.label} <span style={{ color: "#94A3B8", fontWeight: 400 }}>· {f.weightPercent}%</span></span>
                      <span style={{ color: "#64748B" }}>{f.ratingPercent}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{f.detail}</div>
                    <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2, marginTop: 6 }}><div style={{ width: `${f.ratingPercent}%`, height: 4, background: "var(--brand-primary)", borderRadius: 2 }} /></div>
                  </div>
                ))}
              </AdminCard>
            </TwoCol>

            <div style={{ marginTop: 16 }}><AdminCard>
              <SectionTitle>Loans</SectionTitle>
              {d.loans.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No loan applications.</p> : (
                <AdminTable columns={["Loan", "Principal", "Total due", "Status", "Applied", "Due"]}
                  rows={d.loans.map((l) => [shortId(l.id), ugx(l.amount), ugx(l.total), <StatusBadge key={l.id} status={l.status} label={LOAN_STATUS_LABEL[l.status]} />, fmtDate(l.createdAt), fmtDate(l.dueDate)])}
                  onRowClick={(i) => onNavigate(withId("admin-loan-detail", d.loans[i].id))} />
              )}
            </AdminCard></div>

            <div style={{ marginTop: 16 }}><AdminCard>
              <SectionTitle>Repayments</SectionTitle>
              {d.repayments.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No repayment schedules.</p> : (
                <AdminTable columns={["Due", "Total", "Paid", "Outstanding", "Status"]}
                  rows={d.repayments.map((r) => [fmtDate(r.dueDate), ugx(r.total), ugx(r.amountPaid), ugx(r.outstanding), <StatusBadge key={r.id} status={r.status} />])} />
              )}
            </AdminCard></div>

            <div style={{ marginTop: 16 }}><AdminCard>
              <SectionTitle>Transactions</SectionTitle>
              {d.transactions.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No transactions.</p> : (
                <AdminTable columns={["When", "Type", "Amount", "Status", "Reference"]}
                  rows={d.transactions.map((t) => [fmtDateTime(t.createdAt), TX_TYPE_LABEL[t.type] ?? t.type, ugx(t.amount), <StatusBadge key={t.id} status={t.status} />, <span key="r" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{t.reference ?? "—"}</span>])}
                  onRowClick={(i) => onNavigate(withId("admin-transaction-detail", d.transactions[i].id))} />
              )}
            </AdminCard></div>

            <TwoCol>
              <div style={{ marginTop: 16 }}><AdminCard>
                <SectionTitle>Support tickets</SectionTitle>
                {d.tickets.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No tickets.</p> : (
                  <AdminTable columns={["Subject", "Priority", "Status", "Updated"]}
                    rows={d.tickets.map((t) => [t.subject, <StatusBadge key="p" status={t.priority} />, <StatusBadge key="s" status={t.status} />, fmtDate(t.updatedAt)])}
                    onRowClick={(i) => onNavigate(withId("admin-ticket-detail", d.tickets[i].id))} />
                )}
              </AdminCard></div>
              <div style={{ marginTop: 16 }}><AdminCard>
                <SectionTitle>Activity log</SectionTitle>
                {d.audit.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No recorded activity.</p> : (
                  <AdminTable columns={["When", "Action", "By"]} rows={d.audit.slice(0, 20).map((e) => [fmtDateTime(e.createdAt), e.action, e.actorName ?? e.actorRole ?? "system"])} />
                )}
              </AdminCard></div>
            </TwoCol>

            {modal === "edit" && <EditCustomerModal detail={d} onClose={() => setModal(null)} onSaved={(m) => { setNote(m); detail.reload(); }} />}
            {modal === "ticket" && <NewTicketModal customerId={c.id} customerName={c.fullName} onClose={() => setModal(null)} onCreated={(tid) => onNavigate(withId("admin-ticket-detail", tid))} />}
            {modal === "deactivate" && (
              <ConfirmDialog title="Deactivate customer" confirmLabel="Deactivate" requireReason
                message={<>This blocks <strong>{c.fullName}</strong> from signing in and ends their sessions. No loans, repayments, transactions or KYC records are deleted, and the account can be reactivated later.</>}
                onConfirm={(r) => toggleActive("deactivate", r)} onClose={() => { setModal(null); action.clearError(); }} busy={action.busy} error={action.error} />
            )}
            {modal === "reactivate" && (
              <ConfirmDialog title="Reactivate customer" variant="success" confirmLabel="Reactivate" requireReason={false} reasonLabel="Notes"
                message={<>Restores sign-in access for <strong>{c.fullName}</strong>.</>}
                onConfirm={(r) => toggleActive("reactivate", r)} onClose={() => { setModal(null); action.clearError(); }} busy={action.busy} error={action.error} />
            )}
          </>
        );
      })()}
    </AdminLayout>
  );
}

// ── KYC queue ─────────────────────────────────────────────────────────────────

type KycFilter = "pending" | "approved" | "rejected" | "all";

export function AdminCustomerKYCScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [filter, setFilter] = useState<KycFilter>("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const summary = useAdminQuery(token ? () => api.admin.kycSummary(token) : null, [token]);
  const list = useAdminQuery(token ? () => api.admin.kycQueue(token, { status: filter, q: dq, page, pageSize: 25 }) : null, [token, filter, dq, page], { pollMs: 20_000 });

  return (
    <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC Review">
      <AdminPageHeader title="KYC Review" subtitle="Identity submissions from the customer app. Approving here is what unlocks lending for the customer." />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
          options={[
            { id: "pending", label: "Awaiting review", count: summary.data?.pending },
            { id: "approved", label: "Verified", count: summary.data?.approved },
            { id: "rejected", label: "Rejected", count: summary.data?.rejected },
            { id: "all", label: "All submitted" },
          ]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, phone, NIN…" />
      </div>
      <AsyncState state={list} isEmpty={(d) => d.items.length === 0}
        emptyTitle={filter === "pending" ? "No KYC submissions awaiting review" : "Nothing here yet"}
        emptyHint={filter === "pending" ? "New submissions appear here as soon as a customer uploads their ID." : undefined}>
        {(d) => (
          <>
            <AdminTable columns={["Customer", "NIN", "Submitted", "Auto-check", "Documents", "Status"]}
              rows={d.items.map((k) => [
                <div key="n"><div style={{ fontWeight: 600 }}>{k.fullName}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{k.phone ?? ""}</div></div>,
                <span key="nin" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{k.nationalId ?? "—"}</span>,
                fmtDateTime(k.kycSubmittedAt),
                k.kycProvider && k.kycProvider !== "none" ? `${k.kycProvider}${k.kycReference ? ` · ${k.kycReference.slice(0, 10)}` : ""}` : "Manual review",
                `${k.documents.front ? "Front" : "—"} · ${k.documents.back ? "Back" : "—"}`,
                <StatusBadge key="s" status={k.kycStatus} label={KYC_LABEL[k.kycStatus]} />,
              ])}
              onRowClick={(i) => onNavigate(withId("admin-kyc-detail", d.items[i].id))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

// ── KYC detail ────────────────────────────────────────────────────────────────

export function AdminKycDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const id = useQueryParam("id");
  const detail = useAdminQuery(token && id ? () => api.admin.kyc(token, id) : null, [token, id]);
  const docs = useAdminQuery(token && id ? () => api.admin.kycDocuments(token, id) : null, [token, id]);
  const action = useAction();
  const [dialog, setDialog] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState<string | null>(null);

  if (!id) {
    return <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC"><ErrorState message="No customer selected." onRetry={() => onNavigate("admin-customer-kyc")} /></AdminLayout>;
  }

  const review = async (kind: "approve" | "reject", notes: string) => {
    if (!token) return;
    const r = await action.run(() => kind === "approve" ? api.admin.approveKyc(token, id, notes) : api.admin.rejectKyc(token, id, notes));
    if (r) { setDialog(null); setNote(kind === "approve" ? "Identity verified. The customer has been notified and can now apply for loans." : "Submission rejected. The customer has been asked to resubmit."); detail.reload(); }
  };

  return (
    <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC review">
      {detail.loading && !detail.data ? <LoadingState /> : detail.error && !detail.data ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (() => {
        const k = detail.data.kyc;
        const canApprove = k.kycStatus === "pending" || k.kycStatus === "rejected";
        const canReject = k.kycStatus === "pending" || k.kycStatus === "verified";
        return (
          <>
            <AdminPageHeader title={k.fullName} subtitle={`${k.phone ?? ""} · ${k.kycSubmittedAt ? `submitted ${fmtDateTime(k.kycSubmittedAt)}` : "not submitted"}`}
              action={
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge status={k.kycStatus} label={KYC_LABEL[k.kycStatus]} />
                  <Btn variant="secondary" onClick={() => onNavigate(withId("admin-customer-detail", k.id))}>Open customer</Btn>
                  {canApprove && <Btn variant="success" onClick={() => setDialog("approve")}><ShieldCheck size={14} /> Approve</Btn>}
                  {canReject && <Btn variant="danger" onClick={() => setDialog("reject")}><ShieldX size={14} /> Reject</Btn>}
                </div>
              } />
            <SuccessNote message={note} />

            <TwoCol>
              <AdminCard>
                <SectionTitle>Submitted details</SectionTitle>
                <Field label="Full name" value={k.fullName} />
                <Field label="National ID (NIN)" value={k.nationalId ?? "—"} mono />
                <Field label="Phone" value={<>{k.phone ?? "—"} {k.phoneVerified ? <StatusBadge status="verified" label="verified" /> : null}</>} />
                <Field label="District" value={k.district || "—"} />
                <Field label="Automated check" value={k.kycProvider && k.kycProvider !== "none" ? `${k.kycProvider}${k.kycReference ? ` · ref ${k.kycReference}` : ""}` : "Not available — manual review required"} />
                <Field label="Review" value={k.kycReviewStatus ? `${k.kycReviewStatus} · ${fmtDateTime(k.kycReviewedAt)}${k.reviewedByName ? ` by ${k.reviewedByName}` : ""}` : "Not reviewed"} />
                {k.kycReviewNotes && <Field label="Review notes" value={k.kycReviewNotes} />}
              </AdminCard>
              <AdminCard>
                <SectionTitle>Review history</SectionTitle>
                {detail.data.history.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No review actions yet.</p> : (
                  <AdminTable columns={["When", "Action", "By", "Notes"]}
                    rows={detail.data.history.map((h) => [fmtDateTime(h.createdAt), h.action.replace("kyc.", ""), h.actorName ?? "—", String((h.metadata as { notes?: string }).notes ?? "—")])} />
                )}
              </AdminCard>
            </TwoCol>

            <div style={{ marginTop: 16 }}><AdminCard>
              <SectionTitle>ID documents</SectionTitle>
              <p style={{ fontSize: 11, color: "#94A3B8", margin: "0 0 12px" }}>Viewing these images is recorded in the audit log. Do not download or share them outside this portal.</p>
              {docs.loading && !docs.data ? <LoadingState label="Loading documents…" /> : docs.error && !docs.data ? <ErrorState message={docs.error} onRetry={docs.reload} /> : docs.data && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {(["front", "back"] as const).map((side) => (
                    <div key={side}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{side === "front" ? "ID front" : "ID back"}</div>
                      {docs.data![side] ? (
                        <img src={docs.data![side]!} alt={`National ID ${side}`} style={{ width: "100%", borderRadius: 10, border: "1px solid #E2E8F0", background: "#F8FAFC" }} />
                      ) : (
                        <div style={{ padding: 24, textAlign: "center", borderRadius: 10, border: "1px dashed #E2E8F0", color: "#94A3B8", fontSize: 12 }}>
                          {docs.data!.missing[side] ? "Image reference exists but the file could not be read from storage." : "Not uploaded."}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AdminCard></div>

            {dialog === "approve" && (
              <ConfirmDialog title="Approve identity" variant="success" confirmLabel="Mark verified" requireReason={false} reasonLabel="Notes"
                message={<>Confirms that the ID documents match <strong>{k.fullName}</strong> ({k.nationalId ?? "no NIN"}). This unlocks loan applications for the customer and notifies them.</>}
                onConfirm={(r) => review("approve", r)} onClose={() => { setDialog(null); action.clearError(); }} busy={action.busy} error={action.error} />
            )}
            {dialog === "reject" && (
              <ConfirmDialog title="Reject submission" confirmLabel="Reject" requireReason reasonLabel="Reason shown to the customer"
                message={<>The customer will be asked to resubmit with the reason you provide.{k.kycStatus === "verified" && <> <strong>This customer is currently verified</strong> — rejecting revokes that status.</>}</>}
                onConfirm={(r) => review("reject", r)} onClose={() => { setDialog(null); action.clearError(); }} busy={action.busy} error={action.error} />
            )}
          </>
        );
      })()}
    </AdminLayout>
  );
}
