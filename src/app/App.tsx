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
import { env } from "./config/env";
import { api } from "./api/client";
import { useNativeChrome } from "../lib/native-chrome";
import { useRealtimeSubscriptions } from "./lib/useRealtimeSubscriptions";
import { clearSessionTokens, readSessionTokens, storeSessionTokens } from "./lib/session-vault";

const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  // These old screens contain static prototype values and must never represent
  // real customer financial state. Keep their URLs compatible by redirecting
  // into the live server-backed flows.
  "customer-disbursement-status": "loan-agreement",
  "customer-credit-limit-increase": "credit-dashboard",
  "customer-loan-refinance": "loan-detail",
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

function Guard({ access, children }: { access: ScreenAccess; children: React.ReactNode }) {
  const { state } = useAppContext();
  const location = useLocation();
  const isStaff = state.role === "admin" || state.role === "manager" || state.role === "officer";

  if (access === "public") return <>{children}</>;
  if (!state.session.isAuthenticated) return <Navigate to="/welcome" replace state={{ from: location }} />;
  if (access === "admin" && !isStaff) return <Navigate to="/home" replace />;
  if (access === "customer" && isStaff) return <Navigate to="/admin-dashboard" replace />;
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
  return <Navigate to={isStaff ? "/admin-dashboard" : "/home"} replace />;
}

function releaseAccess(id: string, registered: ScreenAccess): ScreenAccess {
  // KYC contains private identity documents and is never a public route, even
  // if a stale registry entry accidentally labels it public.
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
              {Object.entries(LEGACY_ROUTE_REDIRECTS).map(([from, to]) => (
                <Route key={`legacy-${from}`} path={`/${from}`} element={<Guard access="customer"><Navigate to={`/${to}`} replace /></Guard>} />
              ))}
              {REGISTERED_SCREENS.filter(({ id }) => !LEGACY_ROUTE_REDIRECTS[id]).map(({ id, access, Component }) => (
                <Route key={id} path={`/${id}`} element={<Guard access={releaseAccess(id, access)}><ScreenRoute Component={Component} /></Guard>} />
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
