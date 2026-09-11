import { ArrowLeft } from "lucide-react";
import { useState } from "react";

interface Props { onNavigate: (s: string) => void; }

const GROUPS = [
  {
    title: "Loan Notifications",
    items: [
      { key: "loan_approved", label: "Loan Approved/Rejected", sub: "When your application gets a decision" },
      { key: "loan_due", label: "Payment Due Reminders", sub: "3 days before due date" },
      { key: "loan_overdue", label: "Overdue Alerts", sub: "When a payment is past due" },
      { key: "loan_disbursed", label: "Loan Disbursement", sub: "When loan is sent to MoMo" },
    ],
  },
  {
    title: "Savings Notifications",
    items: [
      { key: "savings_deposit", label: "Deposit Confirmations", sub: "When money is added to savings" },
      { key: "savings_interest", label: "Interest Credited", sub: "Monthly interest notifications" },
      { key: "savings_goal", label: "Goal Milestones", sub: "When you reach 25%, 50%, 75%, 100%" },
    ],
  },
  {
    title: "Security Alerts",
    items: [
      { key: "login_alert", label: "New Login Alert", sub: "When account is accessed from new device" },
      { key: "password_change", label: "Password Changed", sub: "Confirm account changes" },
    ],
  },
  {
    title: "Channels",
    items: [
      { key: "sms", label: "SMS Notifications", sub: "To +256 770 123 456" },
      { key: "push", label: "Push Notifications", sub: "In-app alerts" },
      { key: "email", label: "Email Notifications", sub: "To amara.nakato@gmail.com" },
    ],
  },
];

export function NotificationSettingsScreen({ onNavigate }: Props) {
  const [settings, setSettings] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.key, true])))
  );

  const toggle = (k: string) => setSettings((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" }}>
        <button onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Notification Settings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        {GROUPS.map((group) => (
          <div key={group.title} style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ padding: "12px 16px", background: "#F8FAFC", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{group.title}</span>
            </div>
            {group.items.map((item, i) => (
              <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < group.items.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{item.sub}</p>
                </div>
                <button onClick={() => toggle(item.key)} style={{ width: 46, height: 26, borderRadius: 13, background: settings[item.key] ? "var(--brand-primary)" : "#D1D5DB", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: settings[item.key] ? "flex-end" : "flex-start", padding: 3, transition: "all 0.2s", flexShrink: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: "white" }} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
