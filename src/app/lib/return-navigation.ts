import { useLocation, useNavigate } from "react-router";

export function safeReturnPath(value: unknown, current: string, fallback: string): string {
  return typeof value === "string" && /^\/[a-z0-9-]+$/.test(value) && value !== current ? value : `/${fallback}`;
}

/** React Router keeps this state on refresh, unlike an in-memory previous page. */
export function useReturnNavigation(fallback: string) {
  const location = useLocation();
  const navigate = useNavigate();
  return () => {
    const target = safeReturnPath(location.state?.returnTo, location.pathname, fallback);
    if (target === location.state?.returnTo && (window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(target, { replace: true });
  };
}
