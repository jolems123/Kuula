import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "../../context/AppContext";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../../api/notification-preferences";

interface Props { onNavigate: (s: string) => void; }
type EditablePreference = "repaymentReminders" | "overdueAlerts";

const ITEMS: Array<{ key: EditablePreference; label: string; sub: string }> = [
  { key: "repaymentReminders", label: "Repayment reminders", sub: "Before an upcoming repayment due date" },
  { key: "overdueAlerts", label: "Overdue alerts", sub: "Daily while a repayment remains overdue" },
];

const DEFAULTS: NotificationPreferences = {
  loanDecision: true,
  repaymentReminders: true,
  overdueAlerts: true,
  disbursementUpdates: true,
  securityAlerts: true,
};

export function NotificationSettingsScreen({ onNavigate }: Props) {
  const session = useSession();
  const [settings, setSettings] = useState<NotificationPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<EditablePreference | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!session.token) { setLoading(false); return; }
      try {
        const preferences = await getNotificationPreferences(session.token);
        if (active) setSettings(preferences);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load notification settings");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [session.token]);

  const toggle = async (key: EditablePreference) => {
    if (!session.token || saving) return;
    const previous = settings;
    const nextValue = !settings[key];
    setSettings({ ...settings, [key]: nextValue });
    setSaving(key);
    setError("");
    try {
      const persisted = await updateNotificationPreferences(session.token, { [key]: nextValue });
      setSettings(persisted);
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : "Could not save notification settings");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "#0B5E3A" }}>
        <button aria-label="Back to settings" onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Notification Settings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <div role="alert" style={{ padding: "11px 13px", borderRadius: 12, background: "#FEF2F2", color: "#991B1B", fontSize: 12 }}>{error}</div>}

        <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "12px 16px", background: "#F3F7F5", borderBottom: "1px solid #E7EFEA" }}><span style={{ fontSize: 11, fontWeight: 700, color: "#52645B", textTransform: "uppercase", letterSpacing: 0.5 }}>Reminder preferences</span></div>
          {ITEMS.map((item, i) => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < ITEMS.length - 1 ? "1px solid #F3F5F4" : "none" }}>
              <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{item.label}</p><p style={{ fontSize: 11, color: "#7A8B82", margin: "2px 0 0" }}>{item.sub}</p></div>
              <button aria-label={`${settings[item.key] ? "Disable" : "Enable"} ${item.label}`} aria-pressed={settings[item.key]} disabled={loading || saving !== null} onClick={() => { void toggle(item.key); }} style={{ width: 46, height: 26, borderRadius: 13, background: settings[item.key] ? "#0B5E3A" : "#CBD5D0", border: "none", cursor: loading || saving ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: settings[item.key] ? "flex-end" : "flex-start", padding: 3, flexShrink: 0, opacity: loading ? 0.6 : 1 }}><div style={{ width: 20, height: 20, borderRadius: 10, background: "white" }} /></button>
            </div>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#EEF7F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><LockKeyhole size={17} color="#0B5E3A" /></div>
          <div><p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>Important financial and security notices stay on</p><p style={{ fontSize: 11, lineHeight: 1.5, color: "#6B7D73", margin: "3px 0 0" }}>Credit decisions, disbursement/settlement updates, identity, password and fraud-protection notices are mandatory service messages and cannot be disabled.</p></div>
        </div>
      </div>
    </div>
  );
}
