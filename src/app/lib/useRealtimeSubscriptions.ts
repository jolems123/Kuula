/**
 * Subscriptions & polling — live updates for messages, notifications,
 * and loan status changes.
 *
 * When Supabase is available, uses Postgres Changes Realtime subscriptions.
 * Otherwise, falls back to a polling strategy for the local Node backend.
 *
 * Returns nothing; automatically cleans up all timers/channels on logout or unmount.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { env } from "../config/env";
import { api } from "../api/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
 * Hook that sets up Realtime subscriptions for the authenticated user.
 * Falls back to polling when Supabase is not available (local Node backend).
 * Automatically cleans up all channels/timers on logout or unmount.
 */
export function useRealtimeSubscriptions(): void {
  const { state, sendMessage, setUnread, markNotificationsRead } = useAppContext();
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const pollTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  // Keep refs to latest state so callbacks don't go stale
  const messagesRef = useRef<Message[]>(state.messages);
  messagesRef.current = state.messages;

  const unreadRef = useRef(state.unreadNotifications);
  unreadRef.current = state.unreadNotifications;

  const tokenRef = useRef<string | null>(state.session.token);
  tokenRef.current = state.session.token;

  const userId = state.user?.id;
  const isAuthenticated = state.session.isAuthenticated;

  // Stable callback references that read from refs
  const handleNewMessage = useCallback(
    (row: Record<string, unknown>) => {
      const msg = mapRowToMessage(row);
      const exists = messagesRef.current.some((m) => m.id === msg.id);
      if (!exists) sendMessage(msg);
    },
    [sendMessage],
  );

  const handleNewNotification = useCallback(() => {
    setUnread(unreadRef.current + 1);
  }, [setUnread]);

  // ── Cleanup helper ────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    channelsRef.current.forEach((ch) => supabase?.removeChannel(ch));
    channelsRef.current = [];
    pollTimersRef.current.forEach(clearInterval);
    pollTimersRef.current = [];
  }, []);

  useEffect(() => {
    // Not authenticated — clean up and bail
    if (!isAuthenticated || !userId) {
      cleanup();
      return;
    }

    const useSupabase = env.BACKEND === "supabase" && !!supabase;

    // ── Supabase: Postgres Changes Realtime subscriptions ─────────────────
    if (useSupabase && supabase) {
      const channels: RealtimeChannel[] = [];

      // Messages: new INSERT where user is sender or receiver
      const msgChannel = supabase
        .channel(`rt:messages:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `or(sender_id.eq.${userId},receiver_id.eq.${userId})`,
          },
          (payload) => handleNewMessage(payload.new as Record<string, unknown>),
        )
        .subscribe();
      channels.push(msgChannel);

      // Notifications: new INSERT for this user
      const notifChannel = supabase
        .channel(`rt:notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id.eq.${userId}`,
          },
          handleNewNotification,
        )
        .subscribe();
      channels.push(notifChannel);

      // Loan applications: status changes for customer loans
      if (state.role === "user") {
        const loanChannel = supabase
          .channel(`rt:loans:${userId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "loan_applications",
              filter: `applicant_id.eq.${userId}`,
            },
            (payload) => {
              const newStatus = (payload.new as Record<string, unknown>)?.status;
              if (newStatus === "offered" || newStatus === "approved" || newStatus === "rejected") {
                window.dispatchEvent(
                  new CustomEvent("kuula:loan-status-changed", {
                    detail: { status: newStatus, loanId: (payload.new as Record<string, unknown>)?.id },
                  }),
                );
              }
            },
          )
          .subscribe();
        channels.push(loanChannel);
      }

      channelsRef.current = channels;

      return () => {
        channels.forEach((ch) => supabase!.removeChannel(ch));
        channelsRef.current = [];
      };
    }

    // ── Node backend: polling fallback ───────────────────────────────────
    const pollMessages = () => {
      const token = tokenRef.current;
      if (!token) return;

      api.getMessages(token).then(({ messages }) => {
        const existingIds = new Set(messagesRef.current.map((m) => m.id));
        for (const msg of messages) {
          if (!existingIds.has(msg.id)) {
            sendMessage(msg);
          }
        }
      }).catch(() => { /* polling errors are non-fatal */ });
    };

    const pollNotifications = () => {
      const token = tokenRef.current;
      if (!token) return;

      api.getNotifications(token).then(({ notifications }) => {
        const unreadCount = notifications.filter((n) => !n.is_read).length;
        if (unreadCount !== unreadRef.current) {
          setUnread(unreadCount);
        }
      }).catch(() => { /* polling errors are non-fatal */ });
    };

    // Initial fetch
    pollMessages();
    pollNotifications();

    // Start polling intervals
    const msgTimer = setInterval(pollMessages, POLL_INTERVAL_MS);
    const notifTimer = setInterval(pollNotifications, POLL_INTERVAL_MS * 3); // Notifications less frequently
    pollTimersRef.current = [msgTimer, notifTimer];

    return () => {
      clearInterval(msgTimer);
      clearInterval(notifTimer);
    };
  }, [isAuthenticated, userId, state.role, handleNewMessage, handleNewNotification, sendMessage, setUnread, cleanup]);
}
