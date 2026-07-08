import { LogOut, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (s: string) => void; }

export function LogoutConfirmScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state, logout } = useAppContext();
  const user = state.user;

  const confirmLogout = () => {
    logout();
    onNavigate("welcome");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(0,0,0,0.5)", paddingTop: 0, justifyContent: "flex-end" }}>
      <div style={{ background: "white", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Drag indicator */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E5E7EB", margin: "0 auto" }} />

        {/* Icon */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogOut size={32} color="#EF4444" strokeWidth={1.5} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1F2937", margin: 0 }}>Log Out?</h2>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 6, lineHeight: 1.6 }}>
              You'll need to log in again to access your Kuula account. Any ongoing sessions will be ended.
            </p>
          </div>
        </div>

        {/* User info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "white" }}>{user?.initials ?? "?"}</span>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>{user?.fullName ?? "—"}</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>{user?.phone || "—"}</p>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={confirmLogout}
            style={{ width: "100%", height: 52, borderRadius: 14, background: "#EF4444", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <LogOut size={18} /> Yes, Log Out
          </button>
          <button
            onClick={() => onNavigate("settings")}
            style={{ width: "100%", height: 52, borderRadius: 14, background: "#F3F4F6", color: "#374151", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <X size={18} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
