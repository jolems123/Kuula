/**
 * Admin → Ledger: transactions and savings. Read-only by design — posted
 * financial rows are never edited or deleted from the portal. Corrections
 * happen through provider reconciliation, which is visible here.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { downloadCsv } from "../../lib/export";
import {
  useAdminQuery, AsyncState, Pagination, SearchInput, FilterTabs, useDebounced, useQueryParam, withId,
  ugx, fmtDate, fmtDateTime, shortId, TX_TYPE_LABEL, LOAN_STATUS_LABEL, Btn, Field, TwoCol, SectionTitle, ErrorState, LoadingState,
} from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

// ── All transactions ──────────────────────────────────────────────────────────

type TxStatusFilter = "all" | "attention" | "pending" | "completed" | "failed";
type TxTypeFilter = "all" | "loans" | "savings" | "loan_disbursement" | "loan_payment" | "savings_deposit" | "savings_withdrawal";

export function AdminAllTransactionsScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const initialStatus = (useQueryParam("status") as TxStatusFilter | null) ?? "all";
  const [status, setStatus] = useState<TxStatusFilter>(["all", "attention", "pending", "completed", "failed"].includes(initialStatus) ? initialStatus : "all");
  const [type, setType] = useState<TxTypeFilter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const list = useAdminQuery(token ? () => api.admin.transactions(token, { status, type, q: dq, page, pageSize: 25 }) : null, [token, status, type, dq, page], { pollMs: 20_000 });

  const totals = list.data?.totals ?? {};
  const totalOf = (s: string) => totals[s]?.amount ?? 0;

  return (
    <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Transactions">
      <AdminPageHeader title="Transactions" subtitle="Every money movement recorded in the ledger. Status changes come only from verified provider callbacks."
        action={<Btn variant="secondary" disabled={!list.data || list.data.items.length === 0}
          onClick={() => downloadCsv("kuula-transactions", ["When", "Customer", "Phone", "Type", "Amount (UGX)", "Status", "Reference", "Provider ref", "Failure"],
            (list.data?.items ?? []).map((t) => [fmtDateTime(t.createdAt), t.userName ?? "", t.userPhone ?? "", TX_TYPE_LABEL[t.type] ?? t.type, t.amount, t.status, t.reference ?? "", t.providerRef ?? "", t.failureReason ?? ""]))}>
          <Download size={14} /> Export page (CSV)</Btn>} />

      {list.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
          <StatCard label="Completed" value={ugx(totalOf("completed"))} sub={`${totals.completed?.count ?? 0} transactions in view`} color="var(--status-success)" icon={<></>} />
          <StatCard label="Pending" value={ugx(totalOf("pending"))} sub={`${totals.pending?.count ?? 0} awaiting provider`} color="#F59E0B" icon={<></>} />
          <StatCard label="Failed" value={ugx(totalOf("failed"))} sub={`${totals.failed?.count ?? 0} did not settle`} color="var(--status-error)" icon={<></>} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <FilterTabs value={status} onChange={(s) => { setStatus(s); setPage(1); }}
            options={[{ id: "all", label: "All" }, { id: "attention", label: "Needs attention" }, { id: "pending", label: "Pending" }, { id: "completed", label: "Completed" }, { id: "failed", label: "Failed" }]} />
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Reference, provider ref, customer…" />
        </div>
        <FilterTabs value={type} onChange={(t) => { setType(t); setPage(1); }}
          options={[{ id: "all", label: "All types" }, { id: "loan_disbursement", label: "Loan payouts" }, { id: "loan_payment", label: "Repayments" }, { id: "savings_deposit", label: "Savings deposits" }, { id: "savings_withdrawal", label: "Savings withdrawals" }]} />
      </div>

      <AsyncState state={list} isEmpty={(d) => d.items.length === 0}
        emptyTitle={dq ? `No transactions match "${dq}"` : status === "attention" ? "No transactions need attention" : "No transactions yet"}
        emptyHint={dq ? undefined : "Transactions are written when a payout or collection is requested from the payment provider."}>
        {(d) => (
          <>
            <AdminTable columns={["When", "Customer", "Type", "Amount", "Status", "Reference", "Settled"]}
              rows={d.items.map((t) => [
                fmtDateTime(t.createdAt),
                <div key="c"><div style={{ fontWeight: 600 }}>{t.userName ?? "—"}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{t.userPhone ?? ""}</div></div>,
                TX_TYPE_LABEL[t.type] ?? t.type,
                <span key="a" style={{ fontWeight: 700, color: t.type.endsWith("withdrawal") || t.type === "loan_disbursement" ? "#B91C1C" : "#166534" }}>{ugx(t.amount)}</span>,
                <StatusBadge key="s" status={t.status} />,
                <span key="r" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{t.reference ?? t.providerRef ?? "—"}</span>,
                t.settledAt ? fmtDateTime(t.settledAt) : "—",
              ])}
              onRowClick={(i) => onNavigate(withId("admin-transaction-detail", d.items[i].id))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

export function AdminTransactionDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const id = useQueryParam("id");
  const detail = useAdminQuery(token && id ? () => api.admin.transaction(token, id) : null, [token, id], { pollMs: 15_000 });

  if (!id) {
    return <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Transaction"><ErrorState message="No transaction selected." onRetry={() => onNavigate("admin-all-transactions")} /></AdminLayout>;
  }

  return (
    <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Transaction">
      {detail.loading && !detail.data ? <LoadingState /> : detail.error && !detail.data ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (() => {
        const t = detail.data.transaction;
        return (
          <>
            <AdminPageHeader title={`${TX_TYPE_LABEL[t.type] ?? t.type} · ${ugx(t.amount)}`} subtitle={`${shortId(t.id)} · ${fmtDateTime(t.createdAt)}`}
              action={<StatusBadge status={t.status} />} />
            <TwoCol>
              <AdminCard>
                <SectionTitle>Ledger entry</SectionTitle>
                <Field label="Type" value={TX_TYPE_LABEL[t.type] ?? t.type} />
                <Field label="Amount" value={ugx(t.amount)} />
                <Field label="Status" value={<StatusBadge status={t.status} />} />
                <Field label="Our reference" value={t.reference ?? "—"} mono />
                <Field label="Provider" value={t.provider ?? "—"} />
                <Field label="Provider reference" value={t.providerRef ?? "—"} mono />
                <Field label="Created" value={fmtDateTime(t.createdAt)} />
                <Field label="Settled" value={t.settledAt ? fmtDateTime(t.settledAt) : "Not settled"} />
                <Field label="Last updated" value={fmtDateTime(t.updatedAt)} />
                {t.failureReason && <Field label="Failure reason" value={t.failureReason} />}
              </AdminCard>
              <AdminCard>
                <SectionTitle action={<Btn small variant="ghost" onClick={() => onNavigate(withId("admin-customer-detail", detail.data!.customer.id))}>Open customer</Btn>}>Customer</SectionTitle>
                <Field label="Name" value={detail.data.customer.fullName} />
                <Field label="Phone" value={detail.data.customer.phone ?? "—"} />
                <Field label="Email" value={detail.data.customer.email ?? "—"} />
                {detail.data.loan && (
                  <>
                    <div style={{ height: 12 }} />
                    <SectionTitle action={<Btn small variant="ghost" onClick={() => onNavigate(withId("admin-loan-detail", detail.data!.loan!.id))}>Open loan</Btn>}>Related loan</SectionTitle>
                    <Field label="Loan" value={shortId(detail.data.loan.id)} mono />
                    <Field label="Principal" value={ugx(detail.data.loan.amount)} />
                    <Field label="Status" value={<StatusBadge status={detail.data.loan.status} label={LOAN_STATUS_LABEL[detail.data.loan.status]} />} />
                  </>
                )}
                {detail.data.repayment && (
                  <>
                    <div style={{ height: 12 }} />
                    <SectionTitle>Related repayment</SectionTitle>
                    <Field label="Due" value={fmtDate(detail.data.repayment.dueDate)} />
                    <Field label="Outstanding" value={ugx(detail.data.repayment.outstanding)} />
                    <Field label="Status" value={<StatusBadge status={detail.data.repayment.status} />} />
                  </>
                )}
              </AdminCard>
            </TwoCol>
            <div style={{ marginTop: 16 }}><AdminCard>
              <SectionTitle>Provider callbacks</SectionTitle>
              {detail.data.webhookEvents.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{t.status === "pending" ? "No callback received yet. The reconciliation sweep re-checks pending transactions with the provider automatically." : "No callbacks recorded for this transaction."}</p>
              ) : (
                <AdminTable columns={["Received", "Event", "Handling", "Result", "Processed"]}
                  rows={detail.data.webhookEvents.map((w) => [fmtDateTime(w.receivedAt), w.eventType ?? "—", <StatusBadge key={w.id} status={w.status === "processed" ? "completed" : w.status} label={w.status} />, w.result ?? "—", w.processedAt ? fmtDateTime(w.processedAt) : "—"])} />
              )}
            </AdminCard></div>
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 14 }}>Ledger rows cannot be edited or deleted. If a settlement is wrong, resolve it with the payment provider; the corrected callback will update this record.</p>
          </>
        );
      })()}
    </AdminLayout>
  );
}

// ── Savings ───────────────────────────────────────────────────────────────────

export function AdminAllSavingsScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAdminQuery(token ? () => api.admin.savingsAccounts(token, { q: dq, page, pageSize: 25 }) : null, [token, dq, page]);

  return (
    <AdminLayout activeScreen="admin-all-savings" onNavigate={onNavigate} title="Savings Accounts">
      <AdminPageHeader title="Savings Accounts" subtitle="Balances are read from each account and cross-checked against the transaction ledger. Balances are not editable here."
        action={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or phone…" />} />
      {list.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
          <StatCard label="Total savings held" value={ugx(list.data.totalBalance)} sub="All customer accounts" color="#8B5CF6" icon={<></>} />
          <StatCard label="Accounts" value={String(list.data.accounts)} sub="One per customer" color="var(--brand-primary)" icon={<></>} />
          <StatCard label="Unreconciled on this page" value={String(list.data.items.filter((a) => !a.reconciled).length)} sub="Balance ≠ ledger sum" color={list.data.items.some((a) => !a.reconciled) ? "var(--status-error)" : "var(--status-success)"} icon={<></>} />
        </div>
      )}
      <AsyncState state={list} isEmpty={(d) => d.items.length === 0} emptyTitle={dq ? `No accounts match "${dq}"` : "No savings accounts yet"}>
        {(d) => (
          <>
            <AdminTable columns={["Customer", "Balance", "Ledger balance", "Reconciled", "Updated", "Account"]}
              rows={d.items.map((a) => [
                <div key="c"><div style={{ fontWeight: 600 }}>{a.fullName}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{a.phone ?? ""}</div></div>,
                <span key="b" style={{ fontWeight: 700 }}>{ugx(a.balance)}</span>,
                ugx(a.ledgerBalance),
                <StatusBadge key="r" status={a.reconciled ? "verified" : "failed"} label={a.reconciled ? "Yes" : "Mismatch"} />,
                fmtDateTime(a.updatedAt),
                <StatusBadge key="s" status={a.active ? "active" : "deactivated"} />,
              ])}
              onRowClick={(i) => onNavigate(withId("admin-customer-detail", d.items[i].userId))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

export function AdminSavingsTransactionsScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [type, setType] = useState<"all" | "savings_deposit" | "savings_withdrawal">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useAdminQuery(token ? () => api.admin.savingsTransactions(token, { type: type === "all" ? undefined : type, q: dq, page, pageSize: 25 }) : null, [token, type, dq, page]);

  return (
    <AdminLayout activeScreen="admin-savings-transactions" onNavigate={onNavigate} title="Savings Transactions">
      <AdminPageHeader title="Savings Transactions" subtitle="Deposits and withdrawals from the ledger" />
      {list.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
          <StatCard label="Deposits (in view)" value={ugx(list.data.totals.savings_deposit ?? 0)} color="var(--status-success)" icon={<></>} />
          <StatCard label="Withdrawals (in view)" value={ugx(list.data.totals.savings_withdrawal ?? 0)} color="var(--status-error)" icon={<></>} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={type} onChange={(t) => { setType(t); setPage(1); }} options={[{ id: "all", label: "All" }, { id: "savings_deposit", label: "Deposits" }, { id: "savings_withdrawal", label: "Withdrawals" }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or phone…" />
      </div>
      <AsyncState state={list} isEmpty={(d) => d.items.length === 0} emptyTitle="No savings transactions yet">
        {(d) => (
          <>
            <AdminTable columns={["When", "Customer", "Type", "Amount", "Status"]}
              rows={d.items.map((t) => [fmtDateTime(t.createdAt), <div key="c"><div style={{ fontWeight: 600 }}>{t.userName ?? "—"}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{t.userPhone ?? ""}</div></div>, TX_TYPE_LABEL[t.type] ?? t.type, ugx(t.amount), <StatusBadge key={t.id} status={t.status} />])}
              onRowClick={(i) => onNavigate(withId("admin-transaction-detail", d.items[i].id))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}
