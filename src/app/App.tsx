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
import { PhotoBackdrop } from "./components/auth/PhotoBackdrop";
import { AdminPartnerFinancingScreen } from "./components/screens/AdminPartnerFinancingScreen";
import { PartnerFinancingScreen } from "./components/screens/PartnerFinancingScreen";
import { api } from "./api/client";
import { useNativeChrome } from "../lib/native-chrome";
import { useRealtimeSubscriptions } from "./lib/useRealtimeSubscriptions";
import { clearSessionTokens, readSessionTokens, storeSessionTokens } from "./lib/session-vault";
import {
  ArrowRightLeft,
  Bell,
  HandCoins,
  House,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { KuulaLogo } from "./components/brand/KuulaLogo";
import { GuarantorInvitationPage } from "./components/GuarantorInvitationPage";

const CUSTOMER_NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Overview", icon: House },
  { id: "quick-actions", label: "Borrow", icon: HandCoins },
  { id: "transaction-history", label: "Transactions", icon: ArrowRightLeft },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
];

const CUSTOMER_TITLES: Record<string, string> = {
  home: "Overview",
  dashboard: "Dashboard",
  "credit-dashboard": "Credit Pass",
  "credit-breakdown": "Credit details",
  "improve-credit": "Improve your credit",
  "quick-actions": "Use your Growth Line",
  "loan-apply": "Apply for credit",
  "loan-review": "Review application",
  "loan-approval": "Application status",
  "loan-detail": "Facility details",
  "loan-history": "Facility history",
  "make-payment": "Make a payment",
  "payment-confirm": "Payment confirmation",
  "loan-agreement": "Loan agreement",
  "transaction-history": "Transactions",
  "transaction-detail": "Transaction details",
  notifications: "Notifications",
  "partner-network": "Partner network",
  "partner-financing": "Partner financing",
  settings: "Settings",
  profile: "Your profile",
  "personal-info": "Personal information",
  "notification-settings": "Notification preferences",
  "privacy-security": "Privacy and security",
  "help-support": "Help and support",
  "contact-support": "Contact support",
  "about-app": "About Kuula",
  "delete-account": "Delete account",
  "user-support-chat": "Kuula support",
  "customer-officer-assigned": "Your credit application",
};

function CustomerWorkspace({ screenId, children }: { screenId: string; children: React.ReactNode }) {
  const { state, logout } = useAppContext();
  const navigate = useNavigate();
  const title = CUSTOMER_TITLES[screenId]
    ?? screenId.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  const initials = (state.user?.fullName ?? "Kuula Customer")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div className="kuula-customer-workspace">
      <aside className="kuula-customer-sidebar" aria-label="Customer workspace">
        <div className="kuula-customer-sidebar__brand">
          <KuulaLogo tone="light" size={34} subtitle="Customer workspace" />
        </div>
        <p className="kuula-customer-sidebar__label">YOUR KUULA</p>
        <nav className="kuula-customer-sidebar__nav" aria-label="Customer navigation">
          {CUSTOMER_NAV.map(({ id, label, icon: Icon }) => {
            const active = id === screenId
              || (id === "credit-dashboard" && ["credit-breakdown", "improve-credit"].includes(screenId))
              || (id === "quick-actions" && ["loan-calculator", "loan-apply", "loan-review", "loan-approval", "loan-detail", "loan-history", "make-payment", "payment-confirm", "loan-agreement", "customer-officer-assigned"].includes(screenId))
              || (id === "transaction-history" && screenId === "transaction-detail")
              || (id === "settings" && ["profile", "personal-info", "notification-settings", "privacy-security", "help-support", "contact-support", "about-app", "delete-account"].includes(screenId));
            return (
              <button
                key={id}
                type="button"
                className={`kuula-customer-sidebar__item${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(`/${id}`)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="kuula-customer-sidebar__account">
          <span className="kuula-customer-sidebar__avatar" aria-hidden="true">{initials}</span>
          <span className="kuula-customer-sidebar__identity">
            <strong>{state.user?.fullName || "Kuula customer"}</strong>
            <small>Customer account</small>
          </span>
          <button type="button" onClick={() => { logout(); navigate("/welcome", { replace: true }); }} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="kuula-customer-workspace__main">
        <header className="kuula-customer-topbar">
          <div>
            <span className="kuula-customer-topbar__eyebrow">Customer workspace</span>
            <h1>{title}</h1>
          </div>
          <div className="kuula-customer-topbar__account">
            <span>{state.user?.fullName || "Kuula customer"}</span>
            <span className="kuula-customer-sidebar__avatar" aria-hidden="true">{initials}</span>
          </div>
        </header>
        <div className="kuula-customer-workspace__content">{children}</div>
      </div>
    </div>
  );
}

const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  "credit-dashboard": "loan-history",
  "credit-breakdown": "loan-history",
  "improve-credit": "loan-history",
  "customer-disbursement-status": "loan-agreement",
  "customer-loan-rejection": "loan-history",
  "customer-credit-limit-increase": "loan-history",
  "customer-loan-refinance": "loan-detail",
  "loan-purpose": "loan-apply",
  "loan-disbursement": "loan-apply",
  "loan-schedule": "loan-detail",
  "wallet": "quick-actions",
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

/** Access tokens last 15 minutes; rotate shortly before expiry so an open app stays signed in. */
function useSessionRefresh(): void {
  const { state, updateToken } = useAppContext();
  const { isAuthenticated, expiresAt } = state.session;

  useEffect(() => {
    if (!isAuthenticated || !expiresAt) return;
    let active = true;
    const timer = setTimeout(async () => {
      const stored = readSessionTokens();
      if (!stored?.refreshToken) return;
      try {
        const refreshed = await api.refresh(stored.refreshToken);
        const nextExpiresAt = Date.now() + refreshed.accessExpiresInSeconds * 1000;
        storeSessionTokens({ accessToken: refreshed.token, refreshToken: refreshed.refreshToken, accessExpiresAt: nextExpiresAt });
        if (active) updateToken(refreshed.token, nextExpiresAt);
      } catch {
        // The next request surfaces the expired session; nothing to recover here.
      }
    }, Math.max(expiresAt - Date.now() - 60_000, 0));
    return () => { active = false; clearTimeout(timer); };
  }, [isAuthenticated, expiresAt, updateToken]);
}

/** Shown while a lazily-loaded screen downloads: a thin bar, not a full-screen splash. */
function PageLoader() {
  return <div className="kx-page-loader" role="progressbar" aria-label="Loading" />;
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

/** Screens drawn over the shared photo backdrop instead of the app chrome. */
const AUTH_SCREENS = new Set(["welcome", "login", "create-account", "phone-verify", "admin-login", "admin-otp", "admin-activate", "kyc"]);

function RootRedirect() {
  const { state } = useAppContext();
  // Signed-out visitors start on the landing page, which offers sign up or log in.
  if (!state.session.isAuthenticated) return <Navigate to="/welcome" replace />;
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
  useSessionRefresh();
  useNativeChrome();
  useRealtimeSubscriptions();

  const screenId = location.pathname.replace(/^\//, "") || "root";
  const isAuthScreen = AUTH_SCREENS.has(screenId);
  const isAdminScreen = screenId.startsWith("admin-") && !isAuthScreen;
  const isPublicScreen = isAuthScreen || screenId === "guarantor/invitation" || screenId === "language" || screenId === "customer-privacy-policy" || screenId === "customer-terms";
  const isCustomerScreen = !isAuthScreen && !isAdminScreen && !isPublicScreen;
  const shellClass = isAuthScreen ? "kuula-auth-shell" : isAdminScreen ? "kuula-admin-shell" : "kuula-mobile-shell";
  const routeContent = <main className="kuula-route-viewport">
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/guarantor/invitation" element={<GuarantorInvitationPage />} />
        <Route path="/onboarding" element={<Navigate to="/welcome" replace />} />
        <Route path="/admin-partner-financing" element={<Guard access="admin" screenId="admin-partner-financing"><ScreenRoute Component={AdminPartnerFinancingScreen} /></Guard>} />
        <Route path="/partner-network" element={<Guard access="customer" screenId="partner-network"><Navigate to="/quick-actions" replace /></Guard>} />
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
  </main>;

  // While a saved session is checked, show the same photo backdrop the landing
  // page uses, so signed-out visitors see one continuous screen instead of a splash.
  if (restoringSession) {
    return (
      <div className="kuula-app-shell kuula-auth-shell" data-screen="starting" data-surface="public">
        <div className="kuula-device-frame"><PhotoBackdrop /></div>
      </div>
    );
  }

  return (
    <div className={`kuula-app-shell ${shellClass}`} data-screen={screenId} data-surface={isAdminScreen ? "admin" : isPublicScreen ? "public" : "customer"}>
      <div className="kuula-device-frame">
        {isAuthScreen && <PhotoBackdrop />}
        {isCustomerScreen ? <CustomerWorkspace screenId={screenId}>{routeContent}</CustomerWorkspace> : routeContent}
      </div>
    </div>
  );
}

export default function App() {
  return <HashRouter><Shell /></HashRouter>;
}
