import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";
import { useAppContext, type Message } from "../../context/AppContext";
import { AdminLayout } from "../AdminLayout";
import { api } from "../../api/client";
import { env } from "../../config/env";
import mockData from "../../data/mockData.json";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

type ThreadSummary = {
  userId: string;
  lastMessage: Message;
  unreadCount: number;
};

const USER_DISPLAY: Record<string, { name: string; initials: string }> = Object.fromEntries(
  mockData.testUsers
    .filter((u) => u.role === "user")
    .map((u) => [u.id, { name: u.fullName, initials: u.initials }])
);

function groupByUser(messages: Message[], adminId: string): ThreadSummary[] {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
  const { t } = useTranslation();
    const otherId = m.senderId === adminId ? m.receiverId : m.senderId;
    if (otherId === adminId) continue;
    if (!map.has(otherId)) map.set(otherId, []);
    map.get(otherId)!.push(m);
  }
  return Array.from(map.entries()).map(([userId, msgs]) => ({
    userId,
    lastMessage: msgs[msgs.length - 1],
    unreadCount: msgs.filter((m) => m.receiverId === adminId && !m.isRead).length,
  }));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AdminSupportInboxScreen({ onNavigate }: Props) {
  const { state, sendMessage, markAllReadForUser } = useAppContext();
  const adminId = state.user?.id ?? "ADMIN-2024-000001";
  const token = state.session.token;
  // Backend-backed inbox sees messages from every customer device; falls back
  // to local state when the API is disabled.
  const useServer = env.USE_API && !!token;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [serverMsgs, setServerMsgs] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!useServer || !token) return;
    try {
      const { messages } = await api.getMessages(token);
      setServerMsgs(messages);
    } catch { /* keep last known inbox on transient errors */ }
  }, [useServer, token]);

  useEffect(() => {
    if (!useServer) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [useServer, refresh]);

  const source = useServer ? serverMsgs : state.messages;
  const threads = groupByUser(source, adminId);

  const selectedThread = selectedUserId
    ? source.filter(
        (m) =>
          (m.senderId === selectedUserId && m.receiverId === adminId) ||
          (m.senderId === adminId && m.receiverId === selectedUserId)
      )
    : [];

  useEffect(() => {
    if (!useServer && selectedUserId) markAllReadForUser(adminId);
  }, [useServer, selectedThread.length, selectedUserId, adminId, markAllReadForUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread.length]);

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text || !selectedUserId) return;
    setReplyText("");
    if (useServer && token) {
      const optimistic: Message = {
        id: `tmp-${Date.now()}`, senderId: adminId, receiverId: selectedUserId,
        content: text, createdAt: new Date().toISOString(), isRead: false,
      };
      setServerMsgs((prev) => [...prev, optimistic]);
      try {
        await api.postMessage(token, text, selectedUserId);
        await refresh();
      } catch { /* refresh on next poll */ }
      return;
    }
    sendMessage({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: adminId,
      receiverId: selectedUserId,
      content: text,
      createdAt: new Date().toISOString(),
      isRead: false,
    });
  };

  const totalUnread = threads.reduce((acc, t) => acc + t.unreadCount, 0);

  return (
    <AdminLayout activeScreen="admin-support-inbox" onNavigate={onNavigate} title="Support Inbox">
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        {!selectedUserId ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <MessageSquare size={20} color="#0B5E3A" />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>
                Support Inbox
              </h2>
              {totalUnread > 0 && (
                <span style={{ background: "#EF4444", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 8px" }}>
                  {totalUnread} unread
                </span>
              )}
            </div>

            {threads.length === 0 ? (
              <div style={{ textAlign: "center", color: "#9CA3AF", padding: 48 }}>No support messages yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {threads.map((t) => {
                  const display = USER_DISPLAY[t.userId] ?? { name: t.userId, initials: t.userId.slice(0, 2).toUpperCase() };
                  return (
                    <button
                      key={t.userId}
                      onClick={() => setSelectedUserId(t.userId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        background: t.unreadCount > 0 ? "#F3FAF7" : "white",
                        border: "1px solid #F1F5F9",
                        borderRadius: 12,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 22, background: "linear-gradient(135deg, #0B5E3A, #064A2E)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{display.initials}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: t.unreadCount > 0 ? 700 : 600, color: "#1F2937" }}>{display.name}</span>
                          <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{relativeTime(t.lastMessage.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 12, color: t.unreadCount > 0 ? "#0B5E3A" : "#6B7280", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: t.unreadCount > 0 ? 600 : 400 }}>
                          {t.lastMessage.content.slice(0, 60)}{t.lastMessage.content.length > 60 ? "…" : ""}
                        </p>
                      </div>
                      {t.unreadCount > 0 && (
                        <span style={{ background: "#EF4444", color: "white", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "2px 6px", flexShrink: 0 }}>
                          {t.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 120px)" }}>
            {/* Thread header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
              <button onClick={() => setSelectedUserId(null)} style={{ width: 36, height: 36, borderRadius: 10, background: "#F1F5F9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <ArrowLeft size={18} color="#374151" />
              </button>
              <div style={{ width: 38, height: 38, borderRadius: 19, background: "linear-gradient(135deg, #0B5E3A, #064A2E)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
                  {(USER_DISPLAY[selectedUserId] ?? { initials: "?" }).initials}
                </span>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1F2937", margin: 0 }}>
                  {(USER_DISPLAY[selectedUserId] ?? { name: selectedUserId }).name}
                </p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>User conversation</p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
              {selectedThread.map((m) => {
                const isAdmin = m.senderId === adminId;
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-end" : "flex-start", gap: 3 }}>
                      <div style={{
                        padding: "10px 14px",
                        borderRadius: isAdmin ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: isAdmin ? "linear-gradient(135deg, #0B5E3A, #064A2E)" : "white",
                        color: isAdmin ? "white" : "#1F2937",
                        fontSize: 13,
                        lineHeight: 1.5,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                        border: isAdmin ? "none" : "1px solid #F1F5F9",
                      }}>
                        {m.content}
                      </div>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmt(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", paddingTop: 12, borderTop: "1px solid #F1F5F9", flexShrink: 0 }}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                placeholder="Reply to this user..."
                rows={2}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  padding: "10px 14px",
                  fontSize: 13,
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleReply}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: replyText.trim() ? "linear-gradient(135deg, #0B5E3A, #064A2E)" : "#E5E7EB",
                  border: "none",
                  cursor: replyText.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Send size={18} color={replyText.trim() ? "white" : "#9CA3AF"} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
