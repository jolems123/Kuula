import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (screen: string) => void; }

export function PersonalInfoScreen({ onNavigate }: Props) {
  const { state, updateProfile } = useAppContext();
  const user = state.user;
  const [form, setForm] = useState({ fullName: "", email: "", dateOfBirth: "", district: "", occupation: "", physicalAddress: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName || "",
      email: user.email || "",
      dateOfBirth: user.dateOfBirth || "",
      district: user.district || "",
      occupation: user.occupation || "",
      physicalAddress: user.physicalAddress || "",
    });
  }, [user]);

  const set = (key: keyof typeof form, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!state.session.token || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await api.updateProfile(state.session.token, form);
      updateProfile(result.user);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 13, color: "#1F2937", background: "white", outline: "none", boxSizing: "border-box" };
  const fields: Array<{ key: keyof typeof form; label: string; type: string; disabled?: boolean }> = [
    { key: "fullName", label: "Full Name", type: "text", disabled: Boolean(user?.verified) },
    { key: "email", label: "Email Address (optional)", type: "email" },
    { key: "dateOfBirth", label: "Date of Birth", type: "date" },
    { key: "district", label: "District", type: "text" },
    { key: "occupation", label: "Occupation", type: "text" },
    { key: "physicalAddress", label: "Physical Address", type: "text" },
  ];

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB" }}>
    <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
      <button aria-label="Back to profile" onClick={() => onNavigate("profile")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
      <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Personal Information</span>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12, color: "#92400E" }}>Phone and NIN changes require identity re-verification. A verified legal name is also locked.</div>
      {error && <div role="alert" style={{ padding: 11, borderRadius: 10, background: "#FEF2F2", color: "#991B1B", fontSize: 12 }}>{error}</div>}
      {saved && <div role="status" style={{ padding: 11, borderRadius: 10, background: "#F0FDF4", color: "#166534", fontSize: 12 }}>Your changes were saved.</div>}
      <div style={{ background: "white", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Phone Number</label><input value={user?.phone || ""} disabled style={{ ...inputStyle, color: "#9CA3AF", background: "#F9FAFB" }} /></div>
        {fields.map(({ key, label, type, disabled }) => <div key={key}><label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>{label}</label><input type={type} value={form[key]} disabled={disabled} onChange={(event) => set(key, event.target.value)} style={{ ...inputStyle, ...(disabled ? { color: "#9CA3AF", background: "#F9FAFB" } : {}) }} /></div>)}
      </div>
      <div style={{ background: "white", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between" }}><div><strong style={{ fontSize: 13 }}>National ID (NIN)</strong><div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{user?.nationalId ? `${user.nationalId.slice(0, 5)}••••${user.nationalId.slice(-3)}` : "Not supplied"}</div></div><span style={{ fontSize: 11, fontWeight: 700, color: user?.verified ? "#178654" : "#B45309" }}>{user?.verified ? "Verified" : "Pending"}</span></div>
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}><button disabled={saving || !state.session.token} onClick={() => { void save(); }} style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #0B5E3A, #064A2E)", color: "white", fontSize: 16, fontWeight: 700, border: "none", opacity: saving ? .6 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button></div>
  </div>;
}
