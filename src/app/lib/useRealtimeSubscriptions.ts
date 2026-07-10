/**
 * Supabase Realtime subscriptions — live updates for messages, notifications,
 * and loan status changes. Only active when authenticated with Supabase.
 *
 * Subscribes to Postgres Changes on:
 *   - messages:       new incoming messages (customer ↔ admin chat)
 *   - notifications:  new notifications (loan approved, payment received, etc.)
 *   - loan_applications: status changes (offered → approved, etc.)
 *
 * Returns nothing; automatically cleans up all channels on logout or unmount.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAppContext, type Message } from "../context/AppContext";

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
 * Automatically cleans up all channels on logout or unmount.
 */
export function useRealtimeSubscriptions(): void {
  const { state, sendMessage, setUnread } = useAppContext();
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // Keep a ref to the latest messages so callbacks don't go stale.
  const messagesRef = useRef<Message[]>(state.messages);
  messagesRef.current = state.messages;

  const unreadRef = useRef(state.unreadNotifications);
  unreadRef.current = state.unreadNotifications;

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

  useEffect(() => {
    if (!supabase || !isAuthenticated || !userId) {
      // Clean up any existing channels if we become unauthenticated
      channelsRef.current.forEach((ch) => supabase!.removeChannel(ch));
      channelsRef.current = [];
      return;
    }

    const channels: RealtimeChannel[] = [];

    // ── Messages: new INSERT where user is sender or receiver ──────────
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

    // ── Notifications: new INSERT for this user ────────────────────────
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

    // ── Loan applications: status changes for customer loans ───────────
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
              // Dispatch a custom event so the UI can react (e.g. show a toast,
              // refresh loan data). The Shell component listens for this.
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
  }, [isAuthenticated, userId, state.role, handleNewMessage, handleNewNotification]);
}