import { ArrowLeft, Bell, CheckCircle, AlertTriangle, Info, DollarSign } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { AppNotification } from "../../api/supabase-service";

interface Props { onNavigate: (s: string) => void; }

const TYPE_ICON: Record<string, typeof Bell> = {
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
  alert: Bell,
};

const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  success: { color: "#10B981", bg: "#F0FDF4" },
  warning: { color: "#F59E0B", bg: "#FFF7ED" },
  info:    { color: "#FF6B35", bg: "#FFF0E8" },
  alert:   { color: "#8B5CF6", bg: "#F5F3FF" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationsListScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state, setUnread } = useAppContext();
  const token = state.session.token;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { notifications: notifs } = await api.getNotifications(token);
      setNotifications(notifs);
      const unreadCount = notifs.filter((n) => !n.is_read).length;
      setUnread(unreadCount);
    } catch { /* graceful — show empty state */ }
    finally { setLoading(false); }
  }, [token, setUnread]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnread(Math.max(0, notifications.filter((n) => !n.is_read).length - 1));
    await api.markNotificationRead(token, id).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    await api.markAllNotificationsRead(token).catch(() => {});
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>{t("notifications.title")}</span>
            {unreadCount > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{t("notifications.unread", { count: unreadCount })}</span>}
          </div>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", border: "none", background: "none", cursor: "pointer", fontWeight: 600 }}>
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 90px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 14 }}>Loading notifications…</p>
          </div>
        )}
        {!loading && notifications.map((n) => {
          const Icon = TYPE_ICON[n.type] ?? Bell;
          const style = TYPE_COLOR[n.type] ?? TYPE_COLOR.info;
          return (
            <button
              key={n.id}
              onClick={() => handleMarkRead(n.id)}
              style={{ background: !n.is_read ? "white" : "#F9FAFB", borderRadius: 16, padding: "14px 16px", border: !n.is_read ? "1px solid #FFDCC8" : "1px solid #F3F4F6", boxShadow: !n.is_read ? "0 2px 8px rgba(255,107,53,0.08)" : "none", cursor: "pointer", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", width: "100%", position: "relative" }}
            >
              {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#FF6B35", position: "absolute", top: 12, right: 12 }} />}
              <div style={{ width: 44, height: 44, borderRadius: 14, background: style.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={22} color={style.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: !n.is_read ? 700 : 600, color: "#1F2937", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</p>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 5px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</p>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>{timeAgo(n.created_at)}</span>
              </div>
            </button>
          );
        })}
        {!loading && notifications.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 16px", color: "#9CA3AF" }}>
            <Bell size={40} color="#D1D5DB" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#6B7280" }}>No notifications yet</p>
            <p style={{ fontSize: 13 }}>Loan updates and account alerts will appear here.</p>
          </div>
        )}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
