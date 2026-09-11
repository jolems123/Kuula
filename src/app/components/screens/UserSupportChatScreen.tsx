import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useAppContext, type Message } from "../../context/AppContext";
import { api } from "../../api/client";
import { env } from "../../config/env";
import { useTranslation } from "react-i18next";

const ADMIN_ID = "ADMIN-2024-000001";

interface Props { onNavigate: (s: string) => void; }

export function UserSupportChatScreen({ onNavigate }: Props) {
  const { state, sendMessage, markAllReadForUser } = useAppContext();
  const { t } = useTranslation();
  const userId = state.user?.id ?? "";
  const token = state.session.token;
  // When the backend is enabled, the thread is shared with the admin inbox
  // across devices; otherwise it falls back to local in-memory state.
  const useServer = env.USE_API && !!token;
  const [inputText, setInputText] = useState("");
  const [serverMsgs, setServerMsgs] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!useServer || !token) return;
    try {
      const { messages } = await api.getMessages(token);
      setServerMsgs(messages);
    } catch { /* keep last known thread on transient errors */ }
  }, [useServer, token]);

  // Poll for new admin replies while the chat is open.
  useEffect(() => {
    if (!useServer) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [useServer, refresh]);

  const source = useServer ? serverMsgs : state.messages;
  const thread = source.filter(
    (m) =>
      (m.senderId === userId && m.receiverId === ADMIN_ID) ||
      (m.senderId === ADMIN_ID && m.receiverId === userId)
  );

  useEffect(() => {
    if (!useServer && userId) markAllReadForUser(userId);
  }, [useServer, thread.length, userId, markAllReadForUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !userId) return;
    setInputText("");
    if (useServer && token) {
      const optimistic: Message = {
        id: `tmp-${Date.now()}`, senderId: userId, receiverId: ADMIN_ID,
        content: text, createdAt: new Date().toISOString(), isRead: false,
      };
      setServerMsgs((prev) => [...prev, optimistic]);
      try {
        await api.postMessage(token, text);
        await refresh();
      } catch { /* refresh on next poll */ }
      return;
    }
    sendMessage({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: userId,
      receiverId: ADMIN_ID,
      content: text,
      createdAt: new Date().toISOString(),
      isRead: false,
    });
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", padding: "16px 16px 14px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={() => onNavigate("help-support")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: 0 }}>Kuula Support</p>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", margin: 0 }}>Online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {thread.length === 0 && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, marginTop: 40 }}>
            No messages yet. Send us a message!
          </div>
        )}
        {thread.map((m) => {
          const isMine = m.senderId === userId;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 3 }}>
                <div style={{
                  padding: "10px 14px",
                  borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: isMine ? "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" : "white",
                  color: isMine ? "white" : "#1F2937",
                  fontSize: 13,
                  lineHeight: 1.5,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
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

      {/* Input */}
      <div style={{ padding: "10px 16px 24px", background: "white", borderTop: "1px solid #F3F4F6", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message..."
          rows={1}
          style={{
            flex: 1,
            borderRadius: 20,
            border: "1.5px solid #E5E7EB",
            padding: "10px 16px",
            fontSize: 13,
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.4,
            maxHeight: 100,
            overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: inputText.trim() ? "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" : "#E5E7EB",
            border: "none",
            cursor: inputText.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Send size={18} color={inputText.trim() ? "white" : "#9CA3AF"} />
        </button>
      </div>
    </div>
  );
}
