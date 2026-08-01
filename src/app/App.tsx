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

const STORAGE_KEY = "kuula_session_token";

function persistToken(token: string): void {
  try { localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
}

function clearPersistedToken(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function readPersistedToken(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function useSessionBootstrap(): boolean {
  const { state, login } = useAppContext();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = readPersistedToken();
      if (token && !state.session.isAuthenticated) {
        try {
          const s = await api.me(token);
          if (active) {
            login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
            persistToken(s.token);
          }
        } catch {
          clearPersistedToken();
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

  if (access === "public") return <>{children}</>;
  if (!state.session.isAuthenticated) {
    return <Navigate to="/welcome" replace state={{ from: location }} />;
  }
  if (access === "admin" && state.role !== "admin") {
    return <Navigate to="/home" replace />;
  }
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
  return <Navigate to={state.role === "admin" ? "/admin-dashboard" : "/home"} replace />;
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
    <div
      className={`kuula-app-shell ${isAdminScreen ? "kuula-admin-shell" : "kuula-mobile-shell"}`}
      data-screen={screenId}
      data-surface={isAdminScreen ? "admin" : isPublicScreen ? "public" : "customer"}
    >
      <div className="kuula-device-frame">
        <main className="kuula-route-viewport">
          <Suspense fallback={<ScreenLoader />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              {REGISTERED_SCREENS.map(({ id, access, Component }) => (
                <Route
                  key={id}
                  path={`/${id}`}
                  element={
                    <Guard access={access}>
                      <ScreenRoute Component={Component} />
                    </Guard>
                  }
                />
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
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
