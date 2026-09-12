import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { api } from "../../api/client";
import type { CustomerRow } from "../../api/types-compat";
import { useAppContext, type Message } from "../../context/AppContext";
import { AdminLayout } from "../AdminLayout";

interface Props { onNavigate: (screen: string) => void }

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}

export function AdminSupportInboxScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const staffId = state.user?.id ?? "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [messageResult, customerResult] = await Promise.all([api.getMessages(token), api.getCustomers(token)]);
      setMessages(messageResult.messages);
      setCustomers(customerResult.customers);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the support inbox");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const customerNames = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.full_name])), [customers]);
  const threads = useMemo(() => {
    const grouped = new Map<string, Message[]>();
    for (const message of messages) {
      const customerId = message.senderId === staffId ? message.receiverId : message.senderId;
      if (!customerId || customerId === staffId) continue;
      grouped.set(customerId, [...(grouped.get(customerId) ?? []), message]);
    }
    return [...grouped.entries()].map(([customerId, items]) => ({ customerId, items, last: items[items.length - 1] }))
      .sort((a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime());
  }, [messages, staffId]);
  const conversation = selected ? threads.find((thread) => thread.customerId === selected)?.items ?? [] : [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversation.length]);

  async function sendReply() {
    const content = reply.trim();
    if (!token || !selected || !content || sending) return;
    setSending(true);
    try {
      const result = await api.postMessage(token, content, selected);
      setMessages((current) => [...current, result.message]);
      setReply("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reply could not be sent");
    } finally {
      setSending(false);
    }
  }

  const nameFor = (id: string) => customerNames.get(id) ?? `Customer ${id.slice(0, 8)}`;

  return <AdminLayout activeScreen="admin-support-inbox" onNavigate={onNavigate} title="Support Inbox">
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {error && <div role="alert" style={{ color: "#991B1B", background: "#FEF2F2", padding: 12, borderRadius: 10, marginBottom: 16 }}>{error}</div>}
      {!selected ? <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><MessageSquare size={20} color="#0B5E3A" /><h2 style={{ margin: 0, fontSize: 18 }}>Customer conversations</h2></div>
        {loading ? <p>Loading conversations…</p> : threads.length === 0 ? <p style={{ color: "#64748B" }}>No support messages yet.</p> :
          <div style={{ display: "grid", gap: 8 }}>{threads.map((thread) => <button key={thread.customerId} onClick={() => setSelected(thread.customerId)} style={{ textAlign: "left", background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{nameFor(thread.customerId)}</strong><small>{relativeTime(thread.last.createdAt)}</small></div>
            <div style={{ color: "#64748B", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.last.content}</div>
          </button>)}</div>}
      </> : <div style={{ display: "flex", flexDirection: "column", minHeight: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><button aria-label="Back to inbox" onClick={() => setSelected(null)} style={{ border: 0, borderRadius: 8, padding: 9, cursor: "pointer" }}><ArrowLeft size={18} /></button><strong>{nameFor(selected)}</strong></div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>{conversation.map((message) => {
          const fromStaff = message.senderId === staffId;
          return <div key={message.id} style={{ alignSelf: fromStaff ? "flex-end" : "flex-start", maxWidth: "72%" }}><div style={{ padding: "10px 14px", borderRadius: 14, background: fromStaff ? "#0B5E3A" : "#F1F5F9", color: fromStaff ? "white" : "#172033" }}>{message.content}</div><small style={{ color: "#64748B" }}>{new Date(message.createdAt).toLocaleString()}</small></div>;
        })}<div ref={bottomRef} /></div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}><textarea aria-label="Reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={2000} rows={2} style={{ flex: 1, padding: 10, border: "1px solid #CBD5E1", borderRadius: 10 }} /><button aria-label="Send reply" disabled={!reply.trim() || sending} onClick={() => void sendReply()} style={{ width: 46, border: 0, borderRadius: 12, background: "#0B5E3A", color: "white", cursor: "pointer" }}><Send size={18} /></button></div>
      </div>}
    </div>
  </AdminLayout>;
}
