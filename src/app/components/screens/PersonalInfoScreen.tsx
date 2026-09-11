import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function PersonalInfoScreen({ onNavigate }: Props) {
  const [form, setForm] = useState({ name: "Amara Nakato", phone: "+256 770 123 456", email: "amara.nakato@gmail.com", dob: "1992-03-15", district: "Kampala", occupation: "Small Business Owner", address: "Plot 24, Nakasero Road, Kampala" });
  const { t } = useTranslation();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fields = [
    { key: "name", label: "Full Name", type: "text" },
    { key: "phone", label: "Phone Number", type: "tel" },
    { key: "email", label: "Email Address", type: "email" },
    { key: "dob", label: "Date of Birth", type: "date" },
    { key: "district", label: "District", type: "text" },
    { key: "occupation", label: "Occupation", type: "text" },
    { key: "address", label: "Physical Address", type: "text" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" }}>
        <button onClick={() => onNavigate("profile")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Personal Information</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
          <p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>⚠ Some fields (NIN, phone) can only be changed with ID re-verification.</p>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>{label}</label>
              <input
                type={type}
                value={form[key as keyof typeof form]}
                onChange={(e) => set(key, e.target.value)}
                disabled={key === "phone"}
                style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 13, color: key === "phone" ? "#9CA3AF" : "#1F2937", background: key === "phone" ? "#F9FAFB" : "white", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>National ID (NIN)</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>CM86H00****PL · Verified</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#12B984", background: "#F0FDF4", padding: "3px 10px", borderRadius: 20 }}>✓ Verified</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("profile")} style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer" }}>
          Save Changes
        </button>
      </div>
    </div>
  );
}
