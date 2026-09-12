import { Suspense, useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router";
import { isStaffRole, useAppContext } from "./context/AppContext";
import { staffCanOpenScreen, staffHome } from "./lib/staff-routing";
import { REGISTERED_SCREENS, type ScreenAccess } from "./screens/registry";
import { AdminPartnerFinancingScreen } from "./components/screens/AdminPartnerFinancingScreen";
import { PartnerNetworkScreen } from "./components/screens/PartnerNetworkScreen";
import { PartnerFinancingScreen } from "./components/screens/PartnerFinancingScreen";
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
  "loan-purpose": "loan-apply",
  "loan-disbursement": "loan-apply",
  "loan-schedule": "loan-detail",
  "wallet": "partner-network",
  "add-payment-method": "home",
  "payment-methods-list": "home",
  "notification-detail": "notifications",
  "customer-support-chat": "user-support-chat",
  "customer-chat-history": "user-support-chat",
  "customer-create-ticket": "user-support-chat",
  "customer-ticket-status": "user-support-chat",
  "customer-ticket-details": "user-support-chat",
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
  }, []);

  return checking;
}

function ScreenLoader() {
  return (
    <div className="kuula-loader-screen">
      <div className="kuula-loader-brand" aria-label="Kuula Microfinance Limited">
        <img src="/kuula-icon.svg" alt="" className="kuula-loader-mark" />
        <strong>Kuula</strong>
        <span>MICROFINANCE LIMITED</span>
        <small>Access <b>•</b> Grow <b>•</b> Prosper</small>
      </div>
      <div className="kuula-loader-track"><span /></div>
      <p>Building your brighter future</p>
    </div>
  );
}

function Guard({ access, screenId, children }: { access: ScreenAccess; screenId: string; children: React.ReactNode }) {
  const { state } = useAppContext();
  const location = useLocation();
  const isStaff = isStaffRole(state.role);

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

function RootRedirect() {
  const { state } = useAppContext();
  if (!state.session.isAuthenticated) {
    // Start every fresh app launch with the pre-welcome experience. Returning
    // customers can still use Skip / Log in to move straight to sign-in.
    if (!env.REVIEWER_MODE) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/welcome" replace />;
  }
  const isStaff = isStaffRole(state.role);
  return <Navigate to={isStaff ? staffHome(state.role) : "/home"} replace />;
}

function releaseAccess(id: string, registered: ScreenAccess): ScreenAccess {
  if (id === "kyc") return "customer";
  return registered;
}

function Shell() {
  const location = useLocation();
  const restoringSession = useSessionBootstrap();
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  useNativeChrome();
  useRealtimeSubscriptions();

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLaunchSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  const screenId = location.pathname.replace(/^\//, "") || "root";
  const isAdminScreen = screenId.startsWith("admin-");
  const isPublicScreen = ["welcome", "language", "onboarding", "create-account", "phone-verify", "biometric-setup", "admin-login", "admin-otp"].includes(screenId);

  if (restoringSession || showLaunchSplash) {
    return (
      <div className="kuula-app-shell kuula-mobile-shell" data-screen="splash" data-surface="public">
        <div className="kuula-device-frame"><ScreenLoader /></div>
      </div>
    );
  }

  return (
    <div className={`kuula-app-shell ${isAdminScreen ? "kuula-admin-shell" : "kuula-mobile-shell"}`} data-screen={screenId} data-surface={isAdminScreen ? "admin" : isPublicScreen ? "public" : "customer"}>
      <div className="kuula-device-frame">
        <main className="kuula-route-viewport">
          <Suspense fallback={<ScreenLoader />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/admin-partner-financing" element={<Guard access="admin" screenId="admin-partner-financing"><ScreenRoute Component={AdminPartnerFinancingScreen} /></Guard>} />
              <Route path="/partner-network" element={<Guard access="customer" screenId="partner-network"><ScreenRoute Component={PartnerNetworkScreen} /></Guard>} />
              <Route path="/partner-financing" element={<Guard access="customer" screenId="partner-financing"><ScreenRoute Component={PartnerFinancingScreen} /></Guard>} />
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
