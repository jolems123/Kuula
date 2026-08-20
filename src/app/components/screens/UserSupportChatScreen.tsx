import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useAppContext, type Message } from "../../context/AppContext";
import { api } from "../../api/client";
import { env } from "../../config/env";

interface Props { onNavigate: (s: string) => void; }

export function UserSupportChatScreen({ onNavigate }: Props) {
  const { state, sendMessage } = useAppContext();
  const userId = state.user?.id ?? "";
  const token = state.session.token;
  const useServer = env.USE_API && !!token;
  const [inputText, setInputText] = useState("");
  const [serverMsgs, setServerMsgs] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!useServer || !token) return;
    try {
      const { messages } = await api.getMessages(token);
      setServerMsgs(messages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh support messages");
    }
  }, [useServer, token]);

  useEffect(() => {
    if (!useServer) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [useServer, refresh]);

  const source = useServer ? serverMsgs : state.messages;
  // The server already ownership-scopes customer message reads. Do not filter
  // against a hardcoded admin ID because production staff IDs are UUIDs.
  const thread = source.filter((m) => m.senderId === userId || m.receiverId === userId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !userId || sending) return;
    if (text.length > 2000) {
      setError("Messages must be 2,000 characters or fewer.");
      return;
    }

    setInputText("");
    setError("");
    if (useServer && token) {
      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        senderId: userId,
        receiverId: "support-pending",
        content: text,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      setServerMsgs((prev) => [...prev, optimistic]);
      setSending(true);
      try {
        await api.postMessage(token, text);
        await refresh();
      } catch (err) {
        setServerMsgs((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInputText(text);
        setError(err instanceof Error ? err.message : "Your message was not sent. Please try again.");
      } finally {
        setSending(false);
      }
      return;
    }

    sendMessage({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: userId,
      receiverId: "local-support",
      content: text,
      createdAt: new Date().toISOString(),
      isRead: false,
    });
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9" }}>
      <div style={{ background: "#0B5E3A", padding: "16px 16px 14px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button aria-label="Back to help" onClick={() => onNavigate("help-support")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: 0 }}>Kuula Support</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", margin: "2px 0 0" }}>Secure support messaging</p>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ margin: "10px 16px 0", padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", color: "#991B1B", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {thread.length === 0 && (
          <div style={{ textAlign: "center", color: "#7A8B82", fontSize: 13, marginTop: 40 }}>
            No messages yet. Send Kuula Support a message and your conversation will appear here.
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
                  background: isMine ? "#0B5E3A" : "white",
                  color: isMine ? "white" : "#1F2937",
                  fontSize: 13,
                  lineHeight: 1.5,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}>
                  {m.content}
                </div>
                <span style={{ fontSize: 10, color: "#87968E" }}>{fmt(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "10px 16px 24px", background: "white", borderTop: "1px solid #E8EEEA", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="Type a message..."
          rows={1}
          maxLength={2000}
          style={{ flex: 1, borderRadius: 20, border: "1.5px solid #DCE6E0", padding: "10px 16px", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 100, overflowY: "auto" }}
        />
        <button
          aria-label="Send support message"
          disabled={!inputText.trim() || sending}
          onClick={() => { void handleSend(); }}
          style={{ width: 44, height: 44, borderRadius: 22, background: inputText.trim() && !sending ? "#0B5E3A" : "#D9E2DD", border: "none", cursor: inputText.trim() && !sending ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <Send size={18} color={inputText.trim() && !sending ? "white" : "#87968E"} />
        </button>
      </div>
    </div>
  );
}
