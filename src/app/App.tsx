import { Suspense, useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router";
import { useAppContext } from "./context/AppContext";
import { REGISTERED_SCREENS, type ScreenAccess } from "./screens/registry";
import { AdminPartnerFinancingScreen } from "./components/screens/AdminPartnerFinancingScreen";
import { env } from "./config/env";
import { api } from "./api/client";
import { useNativeChrome } from "../lib/native-chrome";
import { useRealtimeSubscriptions } from "./lib/useRealtimeSubscriptions";
import { clearSessionTokens, readSessionTokens, storeSessionTokens } from "./lib/session-vault";

const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  "customer-disbursement-status": "loan-agreement",
  "customer-loan-rejection": "loan-history",
  "customer-credit-limit-increase": "credit-dashboard",
  "customer-loan-refinance": "loan-detail",

  // The current application flow collects purpose, affordability and the
  // supported MTN/Airtel rail in one server-compatible form. Older separate
  // purpose/disbursement screens contained unsaved selections and fake account data.
  "loan-purpose": "loan-apply",
  "loan-disbursement": "loan-apply",

  // The active backend currently stores one facility repayment obligation and
  // allows partial payments. The old six-installment schedule was illustrative,
  // not a contractual server schedule, so route it to authoritative credit detail.
  "loan-schedule": "loan-detail",

  // Kuula is a credit/loan platform, not a stored-value wallet. Historical
  // wallet and payment-method screens remain in source only for archive/design
  // reference and are not part of the production customer journey.
  "wallet": "home",
  "add-payment-method": "home",
  "payment-methods-list": "home",

  // The old notification detail screen contains illustrative borrower/loan data
  // and is not backed by a selected persisted notification. Keep customers on
  // the authoritative server-backed notification list until a detail API exists.
  "notification-detail": "notifications",

  // Prototype ticket/history screens contained fabricated agents and ticket data.
  // Keep one real support surface backed by /api/messages.
  "customer-support-chat": "user-support-chat",
  "customer-chat-history": "user-support-chat",
  "customer-create-ticket": "user-support-chat",
  "customer-ticket-status": "user-support-chat",
  "customer-ticket-details": "user-support-chat",

  // These concepts do not yet have an approved production policy/backend flow.
  // Redirect old bookmarks and stale navigation rather than exposing mock or
  // partially implemented financial functionality to customers.
  "customer-available-promotions": "home",
  "customer-claim-promotion": "home",
  "customer-autopay-setup": "make-payment",
  "customer-autopay-settings": "make-payment",
  "customer-autopay-history": "loan-history",
  "customer-autopay-failure": "make-payment",
  "customer-autopay-link": "make-payment",
  "customer-autopay-notification": "make-payment",
  "customer-repayment-offer": "make-payment",
  "customer-accept-plan": "make-payment",
};

const OFFICER_SCREEN_ALLOWLIST = new Set([
  "admin-officer-dashboard",
  "admin-loan-apps",
  "admin-loan-app-detail",
  "admin-customer-list",
  "admin-customer-detail",
  "admin-support-inbox",
  "admin-tickets",
  "admin-ticket-detail",
  "admin-ticket-reply",
  "admin-support-staff-dashboard",
]);

const ADMIN_ONLY_SCREENS = new Set([
  "admin-partner-financing",
  "admin-all-transactions",
  "admin-transaction-detail",
  "admin-payment-processing",
  "admin-failed-transactions",
  "admin-settings",
  "admin-loan-products",
  "admin-interest-settings",
  "admin-service-fee",
  "admin-mtn-api",
  "admin-airtel-api",
  "admin-notif-templates",
  "admin-staff",
  "admin-staff-permissions",
  "admin-auto-approve-settings",
]);

function staffHome(role: string): string {
  return role === "officer" ? "/admin-officer-dashboard" : "/admin-dashboard";
}

function staffCanOpenScreen(screenId: string, role: string): boolean {
  if (role === "admin") return true;
  if (role === "officer") return OFFICER_SCREEN_ALLOWLIST.has(screenId);
  if (role === "manager") return !ADMIN_ONLY_SCREENS.has(screenId);
  return false;
}

function useSessionBootstrap(): boolean {
  const { state, login } = useAppContext();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = readSessionTokens();
      if (stored && !state.session.isAuthenticated) {
        let accessToken = stored.accessToken;
        let refreshToken = stored.refreshToken;
        let expiresAt = stored.accessExpiresAt;
        try {
          if (expiresAt <= Date.now() + 30_000 && refreshToken) {
            const refreshed = await api.refresh(refreshToken);
            accessToken = refreshed.token;
            refreshToken = refreshed.refreshToken;
            expiresAt = Date.now() + refreshed.accessExpiresInSeconds * 1000;
            storeSessionTokens({ accessToken, refreshToken, accessExpiresAt: expiresAt });
          }
          const s = await api.me(accessToken);
          if (active) login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
        } catch {
          try {
            if (!refreshToken) throw new Error("No refresh session");
            const refreshed = await api.refresh(refreshToken);
            accessToken = refreshed.token;
            refreshToken = refreshed.refreshToken;
            expiresAt = Date.now() + refreshed.accessExpiresInSeconds * 1000;
            const s = await api.me(accessToken);
            storeSessionTokens({ accessToken, refreshToken, accessExpiresAt: expiresAt });
            if (active) login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
          } catch {
            clearSessionTokens();
          }
        }
      }
      if (active) setChecking(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return checking;
}

function ScreenLoader() {
  return (
    <div className="kuula-loader-screen">
      <img src="/kuula-icon.svg" alt="Kuula" className="kuula-loader-mark" />
      <div className="kuula-loader-track"><span /></div>
      <p>Building your brighter future</p>
    </div>
  );
}

function Guard({ access, screenId, children }: { access: ScreenAccess; screenId: string; children: React.ReactNode }) {
  const { state } = useAppContext();
  const location = useLocation();
  const isStaff = state.role === "admin" || state.role === "manager" || state.role === "officer";

  if (access === "public") return <>{children}</>;
  if (!state.session.isAuthenticated) return <Navigate to="/welcome" replace state={{ from: location }} />;
  if (access === "admin") {
    if (!isStaff) return <Navigate to="/home" replace />;
    if (!staffCanOpenScreen(screenId, state.role)) return <Navigate to={staffHome(state.role)} replace />;
  }
  if (access === "customer" && isStaff) return <Navigate to={staffHome(state.role)} replace />;
  return <>{children}</>;
}

function ScreenRoute({ Component }: { Component: React.ComponentType<{ onNavigate: (id: string) => void }> }) {
  const navigate = useNavigate();
  return <Component onNavigate={(id) => navigate(`/${id}`)} />;
}

function hasOnboarded(): boolean {
  try { return localStorage.getItem("kuula_onboarded") === "1"; } catch { return false; }
}

function RootRedirect() {
  const { state } = useAppContext();
  if (!state.session.isAuthenticated) {
    if (!env.REVIEWER_MODE && !hasOnboarded()) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/welcome" replace />;
  }
  const isStaff = state.role === "admin" || state.role === "manager" || state.role === "officer";
  return <Navigate to={isStaff ? staffHome(state.role) : "/home"} replace />;
}

function releaseAccess(id: string, registered: ScreenAccess): ScreenAccess {
  if (id === "kyc") return "customer";
  return registered;
}

function Shell() {
  const location = useLocation();
  const restoringSession = useSessionBootstrap();
  useNativeChrome();
  useRealtimeSubscriptions();

  const screenId = location.pathname.replace(/^\//, "") || "root";
  const isAdminScreen = screenId.startsWith("admin-");
  const isPublicScreen = ["welcome", "language", "onboarding", "create-account", "phone-verify", "biometric-setup", "admin-login", "admin-otp"].includes(screenId);

  if (restoringSession) return <ScreenLoader />;

  return (
    <div className={`kuula-app-shell ${isAdminScreen ? "kuula-admin-shell" : "kuula-mobile-shell"}`} data-screen={screenId} data-surface={isAdminScreen ? "admin" : isPublicScreen ? "public" : "customer"}>
      <div className="kuula-device-frame">
        <main className="kuula-route-viewport">
          <Suspense fallback={<ScreenLoader />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/admin-partner-financing" element={<Guard access="admin" screenId="admin-partner-financing"><ScreenRoute Component={AdminPartnerFinancingScreen} /></Guard>} />
              {Object.entries(LEGACY_ROUTE_REDIRECTS).map(([from, to]) => (
                <Route key={`legacy-${from}`} path={`/${from}`} element={<Guard access="customer" screenId={from}><Navigate to={`/${to}`} replace /></Guard>} />
              ))}
              {REGISTERED_SCREENS.filter(({ id }) => !LEGACY_ROUTE_REDIRECTS[id] && id !== "admin-partner-financing").map(({ id, access, Component }) => (
                <Route key={id} path={`/${id}`} element={<Guard access={releaseAccess(id, access)} screenId={id}><ScreenRoute Component={Component} /></Guard>} />
              ))}
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <HashRouter><Shell /></HashRouter>;
}
