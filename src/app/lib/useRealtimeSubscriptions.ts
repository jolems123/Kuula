/**
 * Subscriptions & polling — live updates for messages, notifications,
 * and loan status changes.
 *
 * Uses polling strategy for the Node backend.
 *
 * Returns nothing; automatically cleans up all timers/channels on logout or unmount.
 */
import { useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import { useAppContext, type Message } from "../context/AppContext";

const POLL_INTERVAL_MS = 10_000;

/** Map a raw DB row to a Message matching AppContext's type. */
function mapRowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    receiverId: String(row.receiver_id),
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    isRead: Boolean(row.is_read),
  };
}

/**
 * Hook that sets up polling-based live updates for the authenticated user.
 * Automatically cleans up all timers on logout or unmount.
 */
export function useRealtimeSubscriptions(): void {
  const { state, sendMessage, setUnread } = useAppContext();
  const pollTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const messagesRef = useRef<Message[]>(state.messages);
  messagesRef.current = state.messages;

  const unreadRef = useRef(state.unreadNotifications);
  unreadRef.current = state.unreadNotifications;

  const tokenRef = useRef<string | null>(state.session.token);
  tokenRef.current = state.session.token;

  const userId = state.user?.id;
  const isAuthenticated = state.session.isAuthenticated;

  const cleanup = useCallback(() => {
    pollTimersRef.current.forEach(clearInterval);
    pollTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      cleanup();
      return;
    }

    const pollMessages = () => {
      const token = tokenRef.current;
      if (!token) return;

      api.getMessages(token).then(({ messages }) => {
        const existingIds = new Set(messagesRef.current.map((m) => m.id));
        for (const msg of messages) {
          if (!existingIds.has(msg.id)) sendMessage(msg);
        }
      }).catch(() => { /* polling errors are non-fatal */ });
    };

    const pollNotifications = () => {
      const token = tokenRef.current;
      if (!token) return;

      api.getNotifications(token).then(({ notifications }) => {
        const unreadCount = notifications.filter((n) => !n.isRead).length;
        if (unreadCount !== unreadRef.current) setUnread(unreadCount);
      }).catch(() => { /* polling errors are non-fatal */ });
    };

    pollMessages();
    pollNotifications();

    const msgTimer = setInterval(pollMessages, POLL_INTERVAL_MS);
    const notifTimer = setInterval(pollNotifications, POLL_INTERVAL_MS * 3);
    pollTimersRef.current = [msgTimer, notifTimer];

    return () => {
      clearInterval(msgTimer);
      clearInterval(notifTimer);
    };
  }, [isAuthenticated, userId, sendMessage, setUnread, cleanup]);
}
