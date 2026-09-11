/**
 * Admin → Loans. Lists are one component parameterised by lifecycle group;
 * the detail screen carries the decision actions (approve / reject / withdraw
 * offer). Nothing here moves money — `active` and `paid` come only from
 * verified provider callbacks.
 */
import { useMemo, useState } from "react";
import { Download, CheckCircle, XCircle, Undo2 } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { downloadCsv } from "../../lib/export";
import type { AdminLoanRow } from "../../api/admin-types";
import {
  useAdminQuery, AsyncState, Pagination, SearchInput, FilterTabs, useDebounced, useQueryParam, withId,
  ugx, fmtDate, fmtDateTime, shortId, LOAN_STATUS_LABEL, TX_TYPE_LABEL, Btn, Field, TwoCol, SectionTitle,
  ConfirmDialog, useAction, InlineError, SuccessNote, ErrorState, LoadingState,
} from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

type Group = "pending" | "offered" | "live" | "active" | "overdue" | "history" | "paid" | "rejected" | "failed" | "all";

const PAGE_SIZE = 25;

function LoanList({
  onNavigate, screenId, title, subtitle, tabs, defaultTab, emptyTitle, emptyHint,
}: Props & {
  screenId: string;
  title: string;
  subtitle: string;
  tabs: Array<{ id: Group; label: string }>;
  defaultTab: Group;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [tab, setTab] = useState<Group>(defaultTab);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const summary = useAdminQuery(token ? () => api.admin.loanSummary(token) : null, [token]);
  const list = useAdminQuery(
    token ? () => api.admin.loans(token, { status: tab, q: dq, page, pageSize: PAGE_SIZE }) : null,
    [token, tab, dq, page],
    { pollMs: 15_000 }
  );

  const counts = summary.data?.counts ?? {};
  const groupCount = (g: Group) => {
    const map: Record<Group, string[]> = {
      pending: ["pending", "resubmitted"], offered: ["offered"], live: ["disbursing", "active", "overdue"], active: ["active"],
      overdue: ["overdue"], history: ["paid", "rejected", "disbursement_failed", "failed"], paid: ["paid"], rejected: ["rejected"],
      failed: ["disbursement_failed", "failed"], all: Object.keys(counts),
    };
    return map[g].reduce((s, k) => s + (counts[k] ?? 0), 0);
  };

  const exportCsv = () => {
    const rows = list.data?.items ?? [];
    downloadCsv(`kuula-loans-${tab}`, ["Loan", "Customer", "Phone", "Principal (UGX)", "Total due (UGX)", "Outstanding (UGX)", "Status", "Applied", "Due"],
      rows.map((a) => [shortId(a.id), a.applicantName, a.applicantPhone ?? "", a.amount, a.total, a.repayment?.outstanding ?? "", LOAN_STATUS_LABEL[a.status] ?? a.status, fmtDate(a.createdAt), fmtDate(a.repayment?.dueDate ?? a.dueDate)]));
  };

  return (
    <AdminLayout activeScreen={screenId} onNavigate={onNavigate} title={title}>
      <AdminPageHeader title={title} subtitle={subtitle}
        action={<Btn variant="secondary" onClick={exportCsv} disabled={!list.data || list.data.items.length === 0}><Download size={14} /> Export page (CSV)</Btn>} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={tab} onChange={(t) => { setTab(t); setPage(1); }}
          options={tabs.map((t) => ({ ...t, count: summary.data ? groupCount(t.id) : undefined }))} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, phone, purpose, reference…" />
      </div>

      <AsyncState state={list} isEmpty={(d) => d.items.length === 0}
        emptyTitle={dq ? `No loans match "${dq}"` : emptyTitle} emptyHint={dq ? undefined : emptyHint}>
        {(d) => (
          <>
            <AdminTable
              columns={["Loan", "Customer", "Principal", "Total due", "Outstanding", "Status", "Applied", "Due"]}
              rows={d.items.map((a: AdminLoanRow) => [
                <span key="id" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{shortId(a.id)}</span>,
                <div key="c"><div style={{ fontWeight: 600 }}>{a.applicantName || "—"}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{a.applicantPhone ?? ""}</div></div>,
                ugx(a.amount),
                ugx(a.total),
                a.repayment ? ugx(a.repayment.outstanding) : "—",
                <StatusBadge key="s" status={a.status} label={LOAN_STATUS_LABEL[a.status]} />,
                fmtDate(a.createdAt),
                fmtDate(a.repayment?.dueDate ?? a.dueDate),
              ])}
              onRowClick={(i) => onNavigate(withId("admin-loan-detail", d.items[i].id))}
            />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

export function AdminLoanAppsListScreen(p: Props) {
  return (
    <LoanList {...p} screenId="admin-loan-apps" title="Loan Applications" subtitle="Applications awaiting a decision and offers awaiting acceptance"
      tabs={[{ id: "pending", label: "Awaiting review" }, { id: "offered", label: "Offer sent" }, { id: "rejected", label: "Rejected" }, { id: "all", label: "All" }]}
      defaultTab="pending" emptyTitle="No loan applications yet" emptyHint="New applications from the customer app will appear here." />
  );
}

export function AdminActiveLoansListScreen(p: Props) {
  return (
    <LoanList {...p} screenId="admin-active-loans" title="Active Loans" subtitle="Loans that have been paid out and are being repaid"
      tabs={[{ id: "live", label: "All live" }, { id: "active", label: "Current" }, { id: "overdue", label: "Overdue" }]}
      defaultTab="live" emptyTitle="No active loans" emptyHint="A loan becomes active once the payout is confirmed by the payment provider." />
  );
}

export function AdminOverdueLoansListScreen(p: Props) {
  return (
    <LoanList {...p} screenId="admin-overdue-loans" title="Overdue Loans" subtitle="Repayments past their due date"
      tabs={[{ id: "overdue", label: "Overdue" }]} defaultTab="overdue" emptyTitle="No overdue loans" emptyHint="Nothing is past due right now." />
  );
}

export function AdminLoanHistoryAllScreen(p: Props) {
  return (
    <LoanList {...p} screenId="admin-loan-history" title="Loan History" subtitle="Concluded applications: repaid, rejected and failed payouts"
      tabs={[{ id: "history", label: "All concluded" }, { id: "paid", label: "Repaid" }, { id: "rejected", label: "Rejected" }, { id: "failed", label: "Payout failed" }]}
      defaultTab="history" emptyTitle="No concluded loans yet" />
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function AdminLoanDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const id = useQueryParam("id");
  const detail = useAdminQuery(token && id ? () => api.admin.loan(token, id) : null, [token, id], { pollMs: 15_000 });
  const action = useAction();
  const [dialog, setDialog] = useState<null | "approve" | "reject" | "withdraw">(null);
  const [note, setNote] = useState<string | null>(null);

  const loan = detail.data?.loan;
  const decidable = loan && ["pending", "resubmitted"].includes(loan.status);
  const withdrawable = loan && loan.status === "offered" && !loan.acceptedAt;

  const decide = async (kind: "approve" | "reject" | "withdraw", reason: string) => {
    if (!token || !id) return;
    const call = kind === "approve" ? api.admin.approveLoan(token, id, reason)
      : kind === "reject" ? api.admin.rejectLoan(token, id, reason)
      : api.admin.withdrawOffer(token, id, reason);
    const r = await action.run(() => call);
    if (r) {
      setDialog(null);
      setNote(kind === "approve" ? "Offer sent to the customer. Funds move only after they accept in the app." : kind === "reject" ? "Application rejected and the customer notified." : "Offer withdrawn and the customer notified.");
      detail.reload();
    }
  };

  const activeScreen = useMemo(() => {
    if (!loan) return "admin-loan-apps";
    if (["disbursing", "active"].includes(loan.status)) return "admin-active-loans";
    if (loan.status === "overdue") return "admin-overdue-loans";
    if (["paid", "rejected", "disbursement_failed", "failed"].includes(loan.status)) return "admin-loan-history";
    return "admin-loan-apps";
  }, [loan]);

  if (!id) {
    return (
      <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Loan">
        <ErrorState message="No loan selected." onRetry={() => onNavigate("admin-loan-apps")} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout activeScreen={activeScreen} onNavigate={onNavigate} title="Loan detail">
      {detail.loading && !detail.data ? <LoadingState /> : detail.error && !detail.data ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (
        <>
          <AdminPageHeader
            title={`${ugx(detail.data.loan.amount)} · ${detail.data.applicant?.fullName ?? detail.data.loan.applicantName}`}
            subtitle={`Loan ${shortId(detail.data.loan.id)} · applied ${fmtDateTime(detail.data.loan.createdAt)}`}
            action={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusBadge status={detail.data.loan.status} label={LOAN_STATUS_LABEL[detail.data.loan.status]} />
                {decidable && <Btn variant="success" onClick={() => setDialog("approve")}><CheckCircle size={14} /> Approve</Btn>}
                {decidable && <Btn variant="danger" onClick={() => setDialog("reject")}><XCircle size={14} /> Reject</Btn>}
                {withdrawable && <Btn variant="danger" onClick={() => setDialog("withdraw")}><Undo2 size={14} /> Withdraw offer</Btn>}
              </div>
            }
          />
          <SuccessNote message={note} />
          <InlineError message={action.error && !dialog ? action.error : null} onDismiss={action.clearError} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
            <StatCard label="Principal" value={ugx(detail.data.loan.amount)} icon={<></>} />
            <StatCard label="Interest" value={ugx(detail.data.loan.interest)} sub={`APR ${(detail.data.loan.apr * 100).toFixed(1)}%`} color="#8B5CF6" icon={<></>} />
            <StatCard label="Total due" value={ugx(detail.data.loan.total)} sub={`${detail.data.loan.termDays}-day term`} color="#0EA5E9" icon={<></>} />
            <StatCard label="Outstanding" value={detail.data.repayments.length ? ugx(detail.data.repayments.reduce((s, r) => s + r.outstanding, 0)) : "—"}
              sub={detail.data.repayments.length ? "From repayment ledger" : "No repayment scheduled yet"} color="var(--status-error)" icon={<></>} />
          </div>

          <TwoCol>
            <AdminCard>
              <SectionTitle>Application</SectionTitle>
              <Field label="Purpose" value={detail.data.loan.purpose} />
              <Field label="Payout channel" value={detail.data.loan.channel} />
              <Field label="Applied" value={fmtDateTime(detail.data.loan.createdAt)} />
              <Field label="Decided" value={detail.data.loan.decidedAt ? `${fmtDateTime(detail.data.loan.decidedAt)}${detail.data.loan.approvedByName ? ` by ${detail.data.loan.approvedByName}` : ""}` : "Not yet"} />
              <Field label="Decision notes" value={detail.data.loan.decisionNotes ?? "—"} />
              <Field label="Offer accepted" value={detail.data.loan.acceptedAt ? fmtDateTime(detail.data.loan.acceptedAt) : "Not yet"} />
              <Field label="Disbursed" value={detail.data.loan.disbursedAt ? fmtDateTime(detail.data.loan.disbursedAt) : "Not yet"} />
              <Field label="Provider reference" value={detail.data.loan.disbursementRef ?? "—"} mono />
              <Field label="Due date" value={fmtDate(detail.data.loan.dueDate)} />
            </AdminCard>

            <AdminCard>
              <SectionTitle action={detail.data.applicant && <Btn small variant="ghost" onClick={() => onNavigate(withId("admin-customer-detail", detail.data!.applicant!.id))}>Open customer</Btn>}>Applicant</SectionTitle>
              {detail.data.applicant ? (
                <>
                  <Field label="Name" value={detail.data.applicant.fullName} />
                  <Field label="Phone" value={detail.data.applicant.phone ?? "—"} />
                  <Field label="Email" value={detail.data.applicant.email ?? "—"} />
                  <Field label="KYC" value={<StatusBadge status={detail.data.applicant.kycVerified ? "verified" : "pending"} label={detail.data.applicant.kycVerified ? "Verified" : "Not verified"} />} />
                  <Field label="Account" value={<StatusBadge status={detail.data.applicant.active ? "active" : "deactivated"} />} />
                  <Field label="Loan history" value={`${detail.data.applicant.loansRepaid} repaid of ${detail.data.applicant.loansTotal}`} />
                  <Field label="Customer since" value={fmtDate(detail.data.applicant.createdAt)} />
                </>
              ) : <p style={{ fontSize: 12, color: "#94A3B8" }}>Applicant record not found.</p>}
            </AdminCard>
          </TwoCol>

          <div style={{ marginTop: 16 }}>
            <AdminCard>
              <SectionTitle>Repayment schedule</SectionTitle>
              {detail.data.repayments.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No repayment scheduled. A schedule is created when the payout is confirmed.</p>
              ) : (
                <AdminTable columns={["Due", "Total", "Paid", "Outstanding", "Attempts", "Status"]}
                  rows={detail.data.repayments.map((r) => [fmtDate(r.dueDate), ugx(r.total), ugx(r.amountPaid), ugx(r.outstanding), String(r.attempts), <StatusBadge key={r.id} status={r.status} />])} />
              )}
            </AdminCard>
          </div>

          <div style={{ marginTop: 16 }}>
            <AdminCard>
              <SectionTitle>Money movements</SectionTitle>
              {detail.data.transactions.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No transactions recorded for this loan.</p>
              ) : (
                <AdminTable columns={["When", "Type", "Amount", "Status", "Reference", "Failure"]}
                  rows={detail.data.transactions.map((t) => [fmtDateTime(t.createdAt), TX_TYPE_LABEL[t.type] ?? t.type, ugx(t.amount), <StatusBadge key={t.id} status={t.status} />, <span key="r" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{t.reference ?? t.providerRef ?? "—"}</span>, t.failureReason ?? "—"])}
                  onRowClick={(i) => onNavigate(withId("admin-transaction-detail", detail.data!.transactions[i].id))} />
              )}
            </AdminCard>
          </div>

          <div style={{ marginTop: 16 }}>
            <AdminCard>
              <SectionTitle>Audit trail</SectionTitle>
              {detail.data.audit.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No staff actions recorded yet.</p>
              ) : (
                <AdminTable columns={["When", "Action", "By", "Notes"]}
                  rows={detail.data.audit.map((e) => [fmtDateTime(e.createdAt), e.action, e.actorName ?? e.actorRole ?? "system", String((e.metadata as { notes?: string }).notes ?? "—")])} />
              )}
            </AdminCard>
          </div>

          {dialog === "approve" && (
            <ConfirmDialog title="Approve application" variant="success" confirmLabel="Send offer" requireReason={false} reasonLabel="Approval notes"
              message={<>This sends <strong>{detail.data.applicant?.fullName ?? detail.data.loan.applicantName}</strong> a loan offer for <strong>{ugx(detail.data.loan.amount)}</strong>. No money moves until they accept the agreement in the app and the payment provider confirms the payout.</>}
              onConfirm={(r) => decide("approve", r)} onClose={() => { setDialog(null); action.clearError(); }} busy={action.busy} error={action.error} />
          )}
          {dialog === "reject" && (
            <ConfirmDialog title="Reject application" confirmLabel="Reject" requireReason reasonLabel="Reason shown to the customer"
              message={<>The applicant will be notified in-app with the reason you enter. Rejected applications stay on record and can be resubmitted.</>}
              onConfirm={(r) => decide("reject", r)} onClose={() => { setDialog(null); action.clearError(); }} busy={action.busy} error={action.error} />
          )}
          {dialog === "withdraw" && (
            <ConfirmDialog title="Withdraw offer" confirmLabel="Withdraw" requireReason reasonLabel="Reason shown to the customer"
              message={<>The customer has not accepted this offer yet, so no payout has been requested. Withdrawing marks the application as rejected.</>}
              onConfirm={(r) => decide("withdraw", r)} onClose={() => { setDialog(null); action.clearError(); }} busy={action.busy} error={action.error} />
          )}
        </>
      )}
    </AdminLayout>
  );
}
