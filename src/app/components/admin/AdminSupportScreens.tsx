/**
 * Admin → Support: live message inbox (customer ↔ staff chat) and tracked
 * tickets. Both read and write through the API; nothing is sampled.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageSquare, LifeBuoy, Plus } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext, type Message } from "../../context/AppContext";
import { api } from "../../api/client";
import type { AdminTicket } from "../../api/admin-types";
import {
  useAdminQuery, AsyncState, Pagination, SearchInput, FilterTabs, useDebounced, useQueryParam, withId,
  fmtDate, fmtDateTime, relativeTime, shortId, Btn, Field, TwoCol, SectionTitle, EmptyState,
  useAction, InlineError, SuccessNote, Modal, Labeled, inputStyle, ErrorState, LoadingState,
} from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

// ── Inbox ─────────────────────────────────────────────────────────────────────

type Participant = { id: string; fullName: string; phone: string | null; role: string; active: boolean };
type Thread = { userId: string; last: Message; unread: number; count: number };

function threadsOf(messages: Message[], staffIds: Set<string>, me: string): Thread[] {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
    const other = staffIds.has(m.senderId) ? m.receiverId : m.senderId;
    if (staffIds.has(other)) continue;
    if (!map.has(other)) map.set(other, []);
    map.get(other)!.push(m);
  }
  return Array.from(map.entries())
    .map(([userId, msgs]) => ({ userId, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.receiverId === me && !m.isRead).length, count: msgs.length }))
    .sort((a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime());
}

export function AdminSupportInboxScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const me = state.user?.id ?? "";
  const preselect = useQueryParam("user");
  const [selected, setSelected] = useState<string | null>(preselect);
  const [reply, setReply] = useState("");
  const inbox = useAdminQuery(token ? () => api.getMessages(token) : null, [token], { pollMs: 5_000 });
  const action = useAction();
  const bottomRef = useRef<HTMLDivElement>(null);

  const participants = useMemo(() => new Map<string, Participant>((inbox.data?.participants ?? []).map((p) => [p.id, p])), [inbox.data]);
  const staffIds = useMemo(() => {
    const ids = new Set<string>([me]);
    for (const p of participants.values()) if (p.role === "admin") ids.add(p.id);
    return ids;
  }, [participants, me]);
  const threads = useMemo(() => threadsOf(inbox.data?.messages ?? [], staffIds, me), [inbox.data, staffIds, me]);
  const thread = useMemo(
    () => (selected ? (inbox.data?.messages ?? []).filter((m) => m.senderId === selected || m.receiverId === selected) : []),
    [inbox.data, selected]
  );

  // Opening a thread marks the customer's messages as read server-side.
  useEffect(() => {
    if (!token || !selected) return;
    const unread = thread.some((m) => m.senderId === selected && !m.isRead);
    if (unread) api.markThreadRead(token, selected).then(() => inbox.reload()).catch(() => {/* retried on next poll */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selected, thread.length]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length]);

  const send = async () => {
    const text = reply.trim();
    if (!token || !selected || !text) return;
    const r = await action.run(() => api.postMessage(token, text, selected));
    if (r) { setReply(""); inbox.reload(); }
  };

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  const person = selected ? participants.get(selected) : undefined;

  return (
    <AdminLayout activeScreen="admin-support-inbox" onNavigate={onNavigate} title="Support Inbox">
      <AdminPageHeader title="Support Inbox" subtitle={inbox.data ? `${threads.length} conversation${threads.length === 1 ? "" : "s"}${totalUnread ? ` · ${totalUnread} unread` : ""}` : "Loading conversations…"} />
      <AsyncState state={inbox} isEmpty={(d) => threadsOf(d.messages, staffIds, me).length === 0}
        emptyTitle="No customer messages yet" emptyHint="Messages customers send from Help & Support in the app appear here.">
        {() => (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 16, minHeight: 480 }}>
            <AdminCard style={{ padding: 8, overflowY: "auto", maxHeight: "70vh" }}>
              {threads.map((t) => {
                const p = participants.get(t.userId);
                const active = t.userId === selected;
                return (
                  <button key={t.userId} onClick={() => setSelected(t.userId)}
                    style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "var(--brand-light)" : "transparent", display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "var(--brand-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {(p?.fullName ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p?.fullName || shortId(t.userId)}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{relativeTime(t.last.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.last.content}</div>
                    </div>
                    {t.unread > 0 && <span style={{ background: "#EF4444", color: "white", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>{t.unread}</span>}
                  </button>
                );
              })}
            </AdminCard>

            <AdminCard style={{ display: "flex", flexDirection: "column", padding: 0, maxHeight: "70vh" }}>
              {!selected ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13, padding: 24 }}>
                  <div style={{ textAlign: "center" }}><MessageSquare size={28} color="#CBD5E1" style={{ margin: "0 auto 8px" }} />Select a conversation</div>
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{person?.fullName || shortId(selected)}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{person?.phone ?? ""}{person && !person.active ? " · account deactivated" : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small variant="secondary" onClick={() => onNavigate(withId("admin-customer-detail", selected))}>Customer</Btn>
                      <Btn small variant="secondary" onClick={() => onNavigate(`admin-tickets?new=${selected}`)}><LifeBuoy size={12} /> Open ticket</Btn>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8, background: "#F8FAFC" }}>
                    {thread.map((m) => {
                      const mine = staffIds.has(m.senderId);
                      return (
                        <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                          <div style={{ padding: "8px 12px", borderRadius: 12, background: mine ? "var(--brand-primary)" : "white", color: mine ? "white" : "#0F172A", fontSize: 13, border: mine ? "none" : "1px solid #E2E8F0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, textAlign: mine ? "right" : "left" }}>{fmtDateTime(m.createdAt)}</div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <div style={{ padding: 12, borderTop: "1px solid #F1F5F9" }}>
                    <InlineError message={action.error} onDismiss={action.clearError} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder={person && !person.active ? "This account is deactivated" : "Type a reply…"} disabled={action.busy || (person ? !person.active : false)} style={{ ...inputStyle, flex: 1 }} />
                      <Btn onClick={send} disabled={action.busy || !reply.trim() || (person ? !person.active : false)}><Send size={14} /> Send</Btn>
                    </div>
                  </div>
                </>
              )}
            </AdminCard>
          </div>
        )}
      </AsyncState>
    </AdminLayout>
  );
}

// ── Tickets ───────────────────────────────────────────────────────────────────

type TicketFilter = "active" | "open" | "pending" | "resolved" | "closed" | "all";
const CATEGORIES = ["loans", "repayments", "payments", "kyc", "savings", "account", "other"];
const PRIORITIES = ["low", "medium", "high"];

function CreateTicketModal({ presetCustomerId, onClose, onCreated }: { presetCustomerId?: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { state } = useAppContext();
  const token = state.session.token!;
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [customerId, setCustomerId] = useState<string | null>(presetCustomerId ?? null);
  const [form, setForm] = useState({ subject: "", category: "other", priority: "medium", body: "" });
  const search = useAdminQuery(!customerId && dq.length >= 2 ? () => api.admin.customers(token, { q: dq, pageSize: 8 }) : null, [dq, customerId]);
  const chosen = useAdminQuery(customerId ? () => api.admin.customer(token, customerId) : null, [customerId]);
  const action = useAction();

  const submit = () => customerId && action.run(() => api.admin.createTicket(token, { customerId, ...form }), (r) => onCreated(r.ticket.id));

  return (
    <Modal title="New support ticket" onClose={onClose} width={560}>
      {!customerId ? (
        <>
          <Labeled label="Customer" hint="Search by name, phone or email">
            <SearchInput value={q} onChange={setQ} placeholder="Find customer…" width={9999} />
          </Labeled>
          {dq.length >= 2 && (
            <AsyncState state={search} isEmpty={(d) => d.items.length === 0} emptyTitle={`No customers match "${dq}"`}>
              {(d) => (
                <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                  {d.items.map((c) => (
                    <button key={c.id} onClick={() => setCustomerId(c.id)} style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #F1F5F9", background: "white", cursor: "pointer", fontSize: 13 }}>
                      <strong>{c.fullName}</strong> <span style={{ color: "#94A3B8", fontSize: 11 }}>{c.phone ?? c.email ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </AsyncState>
          )}
        </>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--brand-light)", marginBottom: 12, fontSize: 13 }}>
          <span>{chosen.data ? <><strong>{chosen.data.customer.fullName}</strong> · {chosen.data.customer.phone ?? chosen.data.customer.email ?? ""}</> : "Loading customer…"}</span>
          {!presetCustomerId && <Btn small variant="ghost" onClick={() => setCustomerId(null)}>Change</Btn>}
        </div>
      )}
      <Labeled label="Subject"><input style={inputStyle} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short summary of the issue" /></Labeled>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Labeled label="Category"><select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Labeled>
        <Labeled label="Priority"><select style={inputStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Labeled>
      </div>
      <Labeled label="First note (optional)"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Labeled>
      <InlineError message={action.error} onDismiss={action.clearError} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="secondary" onClick={onClose} disabled={action.busy}>Cancel</Btn>
        <Btn onClick={submit} disabled={action.busy || !customerId || form.subject.trim().length < 3}>{action.busy ? "Creating…" : "Create ticket"}</Btn>
      </div>
    </Modal>
  );
}

export function AdminTicketsListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const newFor = useQueryParam("new");
  const [filter, setFilter] = useState<TicketFilter>("active");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState<boolean>(!!newFor);
  const dq = useDebounced(q);
  const summary = useAdminQuery(token ? () => api.admin.ticketSummary(token) : null, [token]);
  const list = useAdminQuery(token ? () => api.admin.tickets(token, { status: filter, q: dq, page, pageSize: 25 }) : null, [token, filter, dq, page], { pollMs: 20_000 });
  const c = summary.data?.counts ?? {};

  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Support Tickets">
      <AdminPageHeader title="Support Tickets" subtitle="Tracked support cases opened by staff for customers"
        action={<Btn onClick={() => setCreating(true)}><Plus size={14} /> New ticket</Btn>} />
      {summary.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
          <StatCard label="Open" value={String(c.open ?? 0)} sub="Needs staff action" color="var(--brand-primary)" icon={<></>} />
          <StatCard label="Awaiting customer" value={String(c.pending ?? 0)} color="#F59E0B" icon={<></>} />
          <StatCard label="Resolved" value={String(c.resolved ?? 0)} color="var(--status-success)" icon={<></>} />
          <StatCard label="Closed" value={String(c.closed ?? 0)} color="#64748B" icon={<></>} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterTabs value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
          options={[{ id: "active", label: "Active" }, { id: "open", label: "Open" }, { id: "pending", label: "Awaiting customer" }, { id: "resolved", label: "Resolved" }, { id: "closed", label: "Closed" }, { id: "all", label: "All" }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search subject, customer…" />
      </div>
      <AsyncState state={list} isEmpty={(d) => d.items.length === 0}
        emptyTitle={dq ? `No tickets match "${dq}"` : filter === "active" ? "No open tickets" : "No tickets here"}
        emptyHint={dq ? undefined : "Open a ticket from a customer's record or from the support inbox to track a case."}
        emptyAction={!dq ? <Btn onClick={() => setCreating(true)}><Plus size={14} /> New ticket</Btn> : undefined}>
        {(d) => (
          <>
            <AdminTable columns={["Ticket", "Subject", "Customer", "Category", "Priority", "Status", "Assignee", "Updated"]}
              rows={d.items.map((t: AdminTicket) => [
                <span key="id" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{shortId(t.id)}</span>,
                <span key="s" style={{ fontWeight: 600 }}>{t.subject}</span>,
                <div key="c"><div>{t.customer?.fullName ?? "—"}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{t.customer?.phone ?? ""}</div></div>,
                t.category,
                <StatusBadge key="p" status={t.priority} />,
                <StatusBadge key="st" status={t.status} label={t.status === "pending" ? "awaiting customer" : undefined} />,
                t.assignee?.name ?? "Unassigned",
                relativeTime(t.updatedAt),
              ])}
              onRowClick={(i) => onNavigate(withId("admin-ticket-detail", d.items[i].id))} />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncState>
      {creating && <CreateTicketModal presetCustomerId={newFor} onClose={() => setCreating(false)} onCreated={(id) => onNavigate(withId("admin-ticket-detail", id))} />}
    </AdminLayout>
  );
}

export function AdminTicketDetailScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const id = useQueryParam("id");
  const detail = useAdminQuery(token && id ? () => api.admin.ticket(token, id) : null, [token, id], { pollMs: 15_000 });
  const staff = useAdminQuery(token ? () => api.admin.staff(token).catch(() => ({ staff: [] })) : null, [token]);
  const action = useAction();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!id) {
    return <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Ticket"><ErrorState message="No ticket selected." onRetry={() => onNavigate("admin-tickets")} /></AdminLayout>;
  }

  const patch = async (p: Parameters<typeof api.admin.updateTicket>[2], msg: string) => {
    if (!token) return;
    const r = await action.run(() => api.admin.updateTicket(token, id, p));
    if (r) { setNote(msg); detail.reload(); }
  };
  const send = async () => {
    const text = reply.trim();
    if (!token || !text) return;
    const r = await action.run(() => api.admin.replyTicket(token, id, text));
    if (r) { setReply(""); detail.reload(); }
  };

  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Ticket">
      {detail.loading && !detail.data ? <LoadingState /> : detail.error && !detail.data ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (() => {
        const t = detail.data.ticket;
        const closed = t.status === "closed";
        return (
          <>
            <AdminPageHeader title={t.subject} subtitle={`Ticket ${shortId(t.id)} · opened ${fmtDateTime(t.createdAt)} · ${t.customer?.fullName ?? "unknown customer"}`}
              action={
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge status={t.status} label={t.status === "pending" ? "awaiting customer" : undefined} />
                  {t.status !== "resolved" && !closed && <Btn variant="success" onClick={() => patch({ status: "resolved" }, "Ticket marked resolved.")} disabled={action.busy}>Resolve</Btn>}
                  {!closed && <Btn variant="secondary" onClick={() => patch({ status: "closed" }, "Ticket closed.")} disabled={action.busy}>Close</Btn>}
                  {(closed || t.status === "resolved") && <Btn variant="secondary" onClick={() => patch({ status: "open" }, "Ticket reopened.")} disabled={action.busy}>Reopen</Btn>}
                </div>
              } />
            <SuccessNote message={note} />
            <InlineError message={action.error} onDismiss={action.clearError} />

            <TwoCol>
              <AdminCard style={{ display: "flex", flexDirection: "column", padding: 0 }}>
                <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: "55vh", overflowY: "auto", background: "#F8FAFC", borderRadius: "12px 12px 0 0" }}>
                  {detail.data.messages.length === 0 ? (
                    <EmptyState title="No notes on this ticket yet" hint="Add the first note below." />
                  ) : detail.data.messages.map((m) => (
                    <div key={m.id} style={{ alignSelf: m.authorRole === "customer" ? "flex-start" : "flex-end", maxWidth: "80%" }}>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2, textAlign: m.authorRole === "customer" ? "left" : "right" }}>{m.authorName ?? m.authorRole} · {fmtDateTime(m.createdAt)}</div>
                      <div style={{ padding: "8px 12px", borderRadius: 12, background: m.authorRole === "customer" ? "white" : "var(--brand-primary)", color: m.authorRole === "customer" ? "#0F172A" : "white", fontSize: 13, border: m.authorRole === "customer" ? "1px solid #E2E8F0" : "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 12, borderTop: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <textarea aria-label="Reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} disabled={closed || action.busy}
                      placeholder={closed ? "Reopen the ticket to add notes" : "Add a note or reply…"} style={{ ...inputStyle, flex: 1, resize: "vertical" }} />
                    <Btn onClick={send} disabled={closed || action.busy || !reply.trim()}><Send size={14} /> Add</Btn>
                  </div>
                </div>
              </AdminCard>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <AdminCard>
                  <SectionTitle>Details</SectionTitle>
                  <Field label="Status" value={<StatusBadge status={t.status} />} />
                  <Labeled label="Priority">
                    <select style={inputStyle} value={t.priority} disabled={action.busy} onChange={(e) => patch({ priority: e.target.value }, "Priority updated.")}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                  </Labeled>
                  <Labeled label="Category">
                    <select style={inputStyle} value={t.category} disabled={action.busy} onChange={(e) => patch({ category: e.target.value }, "Category updated.")}>{CATEGORIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                  </Labeled>
                  <Labeled label="Assignee">
                    <select style={inputStyle} value={t.assignee?.id ?? ""} disabled={action.busy} onChange={(e) => patch({ assigneeId: e.target.value || null }, e.target.value ? "Ticket assigned." : "Ticket unassigned.")}>
                      <option value="">Unassigned</option>
                      {(staff.data?.staff ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.fullName || s.email}</option>)}
                    </select>
                  </Labeled>
                  <Field label="Opened" value={fmtDateTime(t.createdAt)} />
                  <Field label="Last update" value={fmtDateTime(t.updatedAt)} />
                  {t.resolvedAt && <Field label="Resolved" value={fmtDateTime(t.resolvedAt)} />}
                  {t.closedAt && <Field label="Closed" value={fmtDateTime(t.closedAt)} />}
                </AdminCard>
                <AdminCard>
                  <SectionTitle action={t.customer && <Btn small variant="ghost" onClick={() => onNavigate(withId("admin-customer-detail", t.customer!.id))}>Open customer</Btn>}>Customer</SectionTitle>
                  <Field label="Name" value={t.customer?.fullName ?? "—"} />
                  <Field label="Phone" value={t.customer?.phone ?? "—"} />
                  <Field label="Email" value={t.customer?.email ?? "—"} />
                  <Field label="Account" value={t.customer ? <StatusBadge status={t.customer.active ? "active" : "deactivated"} /> : "—"} />
                  {t.customer && <div style={{ marginTop: 10 }}><Btn small variant="secondary" onClick={() => onNavigate(`admin-support-inbox?user=${t.customer!.id}`)}><MessageSquare size={12} /> Message customer</Btn></div>}
                </AdminCard>
                <AdminCard>
                  <SectionTitle>History</SectionTitle>
                  {detail.data.history.length === 0 ? <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>—</p> : (
                    <AdminTable columns={["When", "Event"]} rows={detail.data.history.map((h) => [fmtDate(h.createdAt), h.action.replace("ticket.", "")])} />
                  )}
                </AdminCard>
              </div>
            </TwoCol>
          </>
        );
      })()}
    </AdminLayout>
  );
}
