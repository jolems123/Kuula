import { ArrowLeft, Camera, Edit2, Star, TrendingUp, UserCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (s: string) => void; }

export function ProfileScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const user = state.user;
  const creditProfile = state.credit;
  const loanProfile = state.loan;

  const rows = [
    { label: t("profile.fullName"), value: user?.fullName ?? "—" },
    { label: t("profile.phone"), value: user?.phone ?? "—" },
    { label: t("profile.email"), value: user?.email || "—" },
    { label: t("profile.nationalId"), value: user?.nationalId ?? "—" },
    { label: t("profile.dateOfBirth"), value: user?.dateOfBirth ?? "—" },
    { label: t("profile.district"), value: user?.district ?? "—" },
    { label: t("profile.occupation"), value: user?.occupation ?? "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>{t("profile.myProfile")}</span>
        </div>
        <button onClick={() => onNavigate("personal-info")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}>
          <Edit2 size={13} /> {t("profile.edit")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 90px" }}>
        {/* Avatar section */}
        <div style={{ background: "linear-gradient(135deg, #FF6B35, #E05A2B)", padding: "0 0 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.fullName} style={{ width: 88, height: 88, borderRadius: 44, border: "3px solid rgba(255,255,255,0.5)", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: 44, background: "rgba(255,255,255,0.25)", border: "3px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: "white" }}>{user?.initials ?? "?"}</span>
              </div>
            )}
            <button style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, background: "#10B981", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Camera size={13} color="white" />
            </button>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: "white", margin: 0 }}>{user?.fullName ?? "—"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", margin: "2px 0 0" }}>{user?.phone ?? "—"} · {user?.district ?? ""}, Uganda</p>
            {user?.verified && (
              <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: "#10B981", background: "rgba(255,255,255,0.95)", padding: "3px 12px", borderRadius: 20, marginTop: 8 }}>{t("profile.verifiedAccount")}</span>
            )}
          </div>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Stats from mockData */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: t("profile.creditScore"), value: String(creditProfile?.score ?? "—"), sub: creditProfile?.tier ?? "—", color: "#10B981", Icon: Star },
              { label: t("profile.totalLoans"), value: String(loanProfile?.totalLoansCount ?? 0), sub: t("profile.allRepaid"), color: "#FF6B35", Icon: TrendingUp },
              { label: t("profile.memberSince"), value: "2024", sub: user?.memberSince ?? "—", color: "#F59E0B", Icon: UserCircle },
            ].map(({ label, value, sub, color, Icon }) => (
              <div key={label} style={{ flex: 1, background: "white", borderRadius: 12, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
                <Icon size={14} color={color} style={{ margin: "0 auto 4px" }} />
                <p style={{ fontSize: 18, fontWeight: 900, color: "#1F2937", margin: 0 }}>{value}</p>
                <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0 }}>{label}</p>
                <p style={{ fontSize: 9, color, fontWeight: 700, margin: "2px 0 0" }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Personal info from mockData */}
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>{t("profile.personalInfo")}</p>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < rows.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", maxWidth: 180, textAlign: "right", wordBreak: "break-word" }}>{r.value}</span>
              </div>
            ))}
          </div>

          <button onClick={() => onNavigate("personal-info")} style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>
            {t("profile.editProfile")}
          </button>
        </div>
      </div>

      <BottomNav active="settings" onNavigate={onNavigate} />
    </div>
  );
}
