import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, X, Globe } from "lucide-react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import kuulaLogo from "/kuula-logo-light.png";
import { useAppContext, type UserProfile, type CreditProfile, type LoanProfile, type Role, type Message } from "../../context/AppContext";
import mockData from "../../data/mockData.json";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";

interface Props {
  onNavigate: (screen: string) => void;
}

type TestUser = typeof mockData.testUsers[number];

// With VITE_USE_API=true auth runs against the Kuula backend; the bundled
// demo accounts are a development aid that is also enabled in production
// builds whenever the API is OFF — this keeps the mobile app fully usable
// (login + every screen) without a live backend, which is what makes the
// packaged iOS/Android build "full function" out of the box. Flip
// VITE_USE_API=true to hide demo accounts and require real auth.
const USE_API = env.USE_API;
const DEMO_LOGIN_ENABLED = !USE_API;

// ── Reviewer sandbox account ──────────────────────────────────────────────────
// When VITE_REVIEWER_MODE=true this account is injected on mount so Apple/Google
// reviewers can browse every screen without a real backend or SMS OTP.
const REVIEWER_USER: UserProfile = {
  id: "rev-sandbox-001",
  role: "user",
  initials: "SR",
  fullName: "Store Reviewer",
  phone: "+256 700 000 001",
  email: "reviewer@kuula.ug",
  nationalId: "CF00000000REVIEW",
  dateOfBirth: "1990-01-01",
  district: "Kampala",
  occupation: "Reviewer",
  memberSince: new Date().toISOString().slice(0, 10),
  verified: true,
  avatarUrl: null,
};
const REVIEWER_CREDIT: CreditProfile = {
  score: 720, maxScore: 850, tier: "Good", percentile: 65, improvementSinceStart: 12,
};
const REVIEWER_LOAN: LoanProfile = {
  availableCredit: 500000, creditIncreaseFromLastMonth: 50000, totalLoansCount: 2,
  activeLoan: {
    id: "rev-loan-001", amount: 200000, repaidPercent: 45,
    status: "active", disbursedDate: "2025-12-01",
  },
  nextPayment: { amount: 73600, dueDate: "2026-07-15", daysLeft: 27 },
};

export function WelcomeScreen({ onNavigate }: Props) {
  const { t, i18n } = useTranslation();
  const { login } = useAppContext();

  // ── Reviewer auto-login ─────────────────────────────────────────────────
  useEffect(() => {
    if (!env.REVIEWER_MODE) return;
    // Fire-and-forget: injects a full session so the reviewer lands on Home.
    login(
      "reviewer-sandbox-token",
      REVIEWER_USER,
      REVIEWER_CREDIT,
      REVIEWER_LOAN,
      85000, // savings balance
      "user" as Role,
      [] as Message[],
      0,
    );
    onNavigate("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedUser, setSelectedUser] = useState<TestUser | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");

  // API sign-in sheet
  const [apiOpen, setApiOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [apiPin, setApiPin] = useState("");
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);

  const handleApiLogin = async () => {
    if (apiLoading) return;
    setApiError("");
    setApiLoading(true);
    try {
      const s = await api.login(phone, apiPin);
      login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
      setApiOpen(false);
      onNavigate("home");
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : "Sign in failed. Try again.");
    } finally {
      setApiLoading(false);
    }
  };

  const handleSelectUser = (u: TestUser) => {
    setSelectedUser(u);
    setPin("");
    setLoginError("");
  };

  const handleLogin = () => {
    if (!selectedUser || !DEMO_LOGIN_ENABLED) return;
    if (!/^\d{4,}$/.test(pin)) {
      setLoginError(t("welcome.pinError"));
      return;
    }

    const credit: CreditProfile = {
      score: mockData.creditProfile.score,
      maxScore: mockData.creditProfile.maxScore,
      tier: mockData.creditProfile.tier as CreditProfile["tier"],
      percentile: mockData.creditProfile.percentile,
      improvementSinceStart: mockData.creditProfile.improvementSinceStart,
    };
    const loan: LoanProfile = {
      availableCredit: mockData.loanProfile.availableCredit,
      creditIncreaseFromLastMonth: mockData.loanProfile.creditIncreaseFromLastMonth,
      totalLoansCount: mockData.loanProfile.totalLoansCount,
      activeLoan: mockData.loanProfile.activeLoan,
      nextPayment: mockData.loanProfile.nextPayment,
    };

    const userProfile: UserProfile = {
      id: selectedUser.id,
      role: selectedUser.role as Role,
      initials: selectedUser.initials,
      fullName: selectedUser.fullName,
      phone: selectedUser.phone,
      email: selectedUser.email,
      nationalId: selectedUser.nationalId,
      dateOfBirth: selectedUser.dateOfBirth,
      district: selectedUser.district,
      occupation: selectedUser.occupation,
      memberSince: selectedUser.memberSince,
      verified: selectedUser.verified,
      avatarUrl: selectedUser.avatarUrl,
    };

    const isAdmin = selectedUser.role === "admin";
    login(
      "mock-token-" + selectedUser.role,
      userProfile,
      isAdmin ? null : credit,
      isAdmin ? null : loan,
      isAdmin ? 0 : mockData.savings.balance,
      selectedUser.role as Role,
      mockData.messages as Message[],
      mockData.notifications.filter((n) => !n.read).length
    );
    setSelectedUser(null);
    onNavigate(isAdmin ? "admin-dashboard" : "home");
  };

  return (
    <div className="flex flex-col h-full bg-white" style={{ paddingTop: 0 }}>
      {/* Background decoration */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: 340,
          background: "linear-gradient(165deg, #0F172A 0%, #166534 52%, #ECFDF5 100%)",
        }}
      />

      {/* Logo area */}
      <div className="relative flex flex-col items-center pt-14 pb-8">
        <div
          className="mb-4"
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.24)",
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(4px)",
            boxShadow: "0 18px 50px rgba(2,6,23,0.38)",
            display: "grid",
            placeItems: "center",
            padding: 12,
          }}
        >
          <ImageWithFallback
            src={kuulaLogo}
            alt="Kuula logo"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#F8FAFC",
            letterSpacing: -1,
            marginBottom: 6,
            textShadow: "0 8px 24px rgba(2,6,23,0.35)",
          }}
        >
          Kuula
        </h1>
        <p style={{ fontSize: 14, color: "#DCFCE7", textAlign: "center", maxWidth: 240 }}>
          {t("welcome.subtitle")}
        </p>
      </div>

      {/* Language picker */}
      <div className="relative flex justify-center px-6 mb-6">
        <button
          onClick={() => onNavigate("language")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #BBF7D0", cursor: "pointer", boxShadow: "0 10px 26px rgba(22,101,52,0.16)" }}
        >
          <Globe size={13} color="#166534" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>
            {i18n.language === "en" ? "English" : i18n.language === "lg" ? "Oluganda" : i18n.language === "sw" ? "Kiswahili" : i18n.language}
          </span>
          <ChevronRight size={12} color="#166534" />
        </button>
      </div>

      {/* CTA buttons */}
      <div className="relative flex-1 flex flex-col justify-end px-6 pb-10 gap-3">
        <button
          onClick={() => onNavigate("kyc")}
          className="w-full flex items-center justify-center gap-2"
          style={{
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #F4612B, #D9531F)",
            color: "white",
            fontSize: 16,
            fontWeight: 600,
            boxShadow: "0 12px 28px rgba(21,128,61,0.35)",
            border: "none",
          }}
        >
          {t("welcome.continueNationalId")}
          <ChevronRight size={18} />
        </button>

        {/* Sign in against the Kuula API */}
        {USE_API && (
          <button
            onClick={() => { setApiOpen(true); setApiError(""); setPhone(""); setApiPin(""); }}
            className="w-full flex items-center justify-center gap-2"
            style={{
              height: 52,
              borderRadius: 16,
              background: "#ECFDF5",
              color: "#166534",
              fontSize: 15,
              fontWeight: 600,
              border: "1.5px solid #BBF7D0",
              cursor: "pointer",
            }}
          >
            {t("welcome.signInPhone")}
          </button>
        )}

        {/* Quick login demo accounts — development builds only */}
        {DEMO_LOGIN_ENABLED && (
        <div style={{ display: "flex", gap: 8 }}>
          {mockData.testUsers.map((u) => {
            const isAdmin = u.role === "admin";
            return (
              <button
                key={u.id}
                onClick={() => handleSelectUser(u)}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 14,
                  background: isAdmin ? "#FEF2F2" : "#ECFDF5",
                  color: isAdmin ? "#B91C1C" : "#166534",
                  fontSize: 13,
                  fontWeight: 700,
                  border: isAdmin ? "1.5px solid #FECACA" : "1.5px solid #BBF7D0",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, opacity: 0.7 }}>
                  {isAdmin ? "ADMIN" : "USER"}
                </span>
                <span>{u.fullName.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
        )}


        <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 4 }}>
          {t("welcome.termsNotice")}
        </p>
      </div>

      {/* API sign-in sheet */}
      {apiOpen && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }}
          onClick={() => setApiOpen(false)}
        >
          <div
            style={{ width: "100%", background: "white", borderRadius: "20px 20px 0 0", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#1F2937", margin: 0 }}>{t("welcome.signIn")}</p>
              <button onClick={() => setApiOpen(false)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                <X size={20} color="#9CA3AF" />
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                {t("welcome.phoneNumber")}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setApiError(""); }}
                placeholder="+256 7XX XXX XXX"
                style={{ width: "100%", height: 46, borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 15, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                PIN
              </label>
              <input
                type="password"
                value={apiPin}
                onChange={(e) => { setApiPin(e.target.value); setApiError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleApiLogin()}
                placeholder={t("welcome.enterPin")}
                maxLength={10}
                style={{ width: "100%", height: 46, borderRadius: 12, border: apiError ? "1.5px solid #EF4444" : "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 16, letterSpacing: 4, outline: "none", boxSizing: "border-box" }}
              />
              {apiError && <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0" }}>{apiError}</p>}
            </div>

            <button
              onClick={handleApiLogin}
              disabled={apiLoading}
              style={{ width: "100%", height: 48, borderRadius: 14, background: apiLoading ? "#86EFAC" : "linear-gradient(135deg, #166534, #15803D)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: apiLoading ? "wait" : "pointer" }}
            >
              {apiLoading ? t("common.signingIn") : t("welcome.signIn")}
            </button>
          </div>
        </div>
      )}

      {/* PIN modal */}
      {selectedUser && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 50,
          }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            style={{
              width: "100%",
              background: "white",
              borderRadius: "20px 20px 0 0",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#1F2937", margin: 0 }}>
                  {t("welcome.loginAs", { name: selectedUser.fullName })}
                </p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                  {selectedUser.role === "admin" ? t("welcome.adminDemo") : t("welcome.userDemo")}
                </p>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                <X size={20} color="#9CA3AF" />
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                {t("welcome.enterPin")}
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setLoginError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder={t("welcome.enterPin")}
                maxLength={10}
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: 12,
                  border: loginError ? "1.5px solid #EF4444" : "1.5px solid #E5E7EB",
                  padding: "0 14px",
                  fontSize: 16,
                  letterSpacing: 4,
                  outline: "none",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
              {loginError && (
                <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0" }}>{loginError}</p>
              )}
            </div>

            <button
              onClick={handleLogin}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(135deg, #F4612B, #D9531F)",
                color: "white",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              {t("common.logIn")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
