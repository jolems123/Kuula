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
import { supabase } from "./lib/supabase";
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

/**
 * Restores an existing session on app start so the user stays logged
 * in across reloads. Supports both Supabase and the local Node backend.
 * Returns whether the initial check is still running so the UI can hold
 * a splash until it resolves.
 */
function useSessionBootstrap(): boolean {
  const { state, login, logout } = useAppContext();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const backend = env.BACKEND;

    (async () => {
      // ── Supabase backend: restore from persisted auth session ──────────
      if (backend === "supabase" && supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token && !state.session.isAuthenticated) {
          try {
            const s = await api.me(token);
            if (active) {
              login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
              persistToken(s.token);
            }
          } catch { /* fall through to unauthenticated */ }
        }
        if (active) setChecking(false);
        return;
      }

      // ── Node backend: restore from localStorage token ─────────────────
      if (backend === "node") {
        const token = readPersistedToken();
        if (token && !state.session.isAuthenticated) {
          try {
            const s = await api.me(token);
            if (active) {
              login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
              persistToken(s.token);
            }
          } catch {
            // Token expired or invalid — clean up
            clearPersistedToken();
          }
        }
        if (active) setChecking(false);
        return;
      }

      // ── No backend configured (demo mode) ─────────────────────────────
      if (active) setChecking(false);
    })();

    // ── Supabase auth state listener ────────────────────────────────────
    if (backend === "supabase" && supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && state.session.isAuthenticated) {
          clearPersistedToken();
          logout();
        }
      });
      return () => { active = false; sub.subscription.unsubscribe(); };
    }

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return checking;
}

/** Full-screen loading state shown while a lazy screen chunk loads. */
function ScreenLoader() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "white",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid #E5E7EB",
          borderTopColor: "#FF6B35",
          borderRadius: "50%",
          animation: "kuula-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes kuula-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Route guard. Unauthenticated users are sent to the welcome screen;
 * authenticated non-admins attempting admin screens are sent home.
 */
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

/**
 * Adapts the registry screens (which navigate via screen ids) to the router.
 * Screen ids map 1:1 to paths: id "loan-apply" -> "/loan-apply".
 */
function ScreenRoute({
  Component,
}: {
  Component: React.ComponentType<{ onNavigate: (id: string) => void }>;
}) {
  const navigate = useNavigate();
  return <Component onNavigate={(id) => navigate(`/${id}`)} />;
}

/** Whether the user has already seen the first-launch onboarding carousel. */
function hasOnboarded(): boolean {
  try { return localStorage.getItem("kuula_onboarded") === "1"; } catch { return false; }
}

/** Lands "/" on the right screen for the current session. */
function RootRedirect() {
  const { state } = useAppContext();
  if (!state.session.isAuthenticated) {
    // First launch shows the onboarding carousel once; afterwards (and for
    // store reviewers who auto-login on welcome) go straight to welcome.
    if (!env.REVIEWER_MODE && !hasOnboarded()) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/welcome" replace />;
  }
  return <Navigate to={state.role === "admin" ? "/admin-dashboard" : "/home"} replace />;
}

function Shell() {
  const location = useLocation();
  const restoringSession = useSessionBootstrap();
  // Configure native mobile chrome (status bar style, splash hide, back button).
  // No-op on web so the same code runs in both environments.
  useNativeChrome();
  // Subscribe to live Realtime updates (messages, notifications, loan status).
  // No-op when not authenticated or when Supabase is not configured.
  useRealtimeSubscriptions();
  // Customer screens are mobile-designed (~390px) and stay capped on larger
  // viewports; the admin console is a desktop layout and uses the full width.
  const isAdminScreen = location.pathname.startsWith("/admin-");

  if (restoringSession) return <ScreenLoader />;

  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        // On wide web viewports we show a soft branded backdrop so the
        // centered phone column reads as "installed app preview" instead of
        // "tiny floating box". On a real mobile device the column fills the
        // screen and the backdrop is never visible.
        background: isAdminScreen
          ? "#F8FAFC"
          : "radial-gradient(1200px 600px at 50% -10%, #FFDCC8 0%, #E2E8F0 55%, #F1F5F9 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Device frame — fixed height, never scrolls itself. On web it is a
          centered phone-width column; on a real device it fills the screen
          and clears the notch / home indicator via safe-area insets. */}
      <div
        style={{
          width: "100%",
          maxWidth: isAdminScreen ? "none" : 480,
          height: "100%",
          background: "white",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          boxSizing: "border-box",
          // On wide web viewports give the column a subtle elevation so it
          // reads as a deliberate app surface. On narrow/mobile viewports the
          // column fills the width and the shadow is invisible against the
          // screen edge.
          boxShadow: isAdminScreen
            ? "none"
            : "0 0 0 1px rgba(15,23,42,0.04), 0 24px 60px -20px rgba(15,23,42,0.25)",
        }}
      >
        {/* Scroll region — the page never scrolls; only this region does, and
            only when a screen's content genuinely exceeds the frame. Screens
            that pin their own header/bottom-nav and scroll their body
            internally fill this exactly and it stays put. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
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
        </div>
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
