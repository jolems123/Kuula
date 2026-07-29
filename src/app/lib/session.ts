/**
 * Client session lifecycle (C-03).
 *
 * The access token lives here, in a module variable, and nowhere else. It is
 * never written to `localStorage`, `sessionStorage`, IndexedDB or a cookie the
 * page can read.
 *
 * Durable authority is the refresh token, which the client only ever handles on
 * native (where it goes straight into the OS keystore). On web the browser
 * holds it as an httpOnly cookie that JavaScript cannot touch.
 *
 * Flows covered:
 *   login / OTP verification  → `adoptSession`
 *   app start                 → `restoreSession` (refresh-token exchange)
 *   token expiry mid-use      → `getAccessToken` refreshes transparently
 *   logout                    → `endSession` (revokes server-side)
 *   revocation / expiry       → refresh fails, `onSessionLost` fires
 *   multiple devices          → independent refresh-token families per device
 */
import { env } from "../config/env";
import {
  saveRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
  isNativePlatform,
  purgeLegacyTokenStorage,
} from "./secure-store";

export interface SessionResponse {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  [key: string]: unknown;
}

let accessToken: string | null = null;
/** Epoch ms at which the access token stops being usable. */
let accessTokenExpiresAt = 0;
let refreshInFlight: Promise<string | null> | null = null;
let sessionLostHandler: (() => void) | null = null;

/** Refresh this many ms before actual expiry, so a request never races it. */
const REFRESH_SKEW_MS = 60_000;

/** Called when the session can no longer be refreshed and the user must sign in. */
export function onSessionLost(handler: () => void): void {
  sessionLostHandler = handler;
}

/** The current access token without attempting a refresh. */
export function peekAccessToken(): string | null {
  return accessToken;
}

/** Record a freshly issued session from login, OTP verification or refresh. */
export async function adoptSession(payload: SessionResponse): Promise<void> {
  accessToken = payload.token || null;
  const ttlSec = typeof payload.expiresIn === "number" && payload.expiresIn > 0 ? payload.expiresIn : 900;
  accessTokenExpiresAt = Date.now() + ttlSec * 1000;

  // Only native receives a refresh token in the body; on web the server sets an
  // httpOnly cookie and sends an empty string here, so there is nothing to save.
  if (payload.refreshToken) {
    await saveRefreshToken(payload.refreshToken);
  }
}

async function callRefresh(): Promise<SessionResponse | null> {
  const body: Record<string, string> = {};
  if (isNativePlatform()) {
    const stored = await loadRefreshToken();
    if (!stored) return null;
    body.refreshToken = stored;
  }

  try {
    const res = await fetch(env.API_BASE_URL + "/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isNativePlatform() ? { "X-Client-Platform": "native" } : {}),
      },
      // Sends the httpOnly refresh cookie on web.
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionResponse;
  } catch {
    return null;
  }
}

/**
 * A valid access token, refreshing first if it is missing or about to expire.
 *
 * Concurrent callers share one in-flight refresh, so a screen firing several
 * requests at once cannot rotate the refresh token several times and trip the
 * server's token-reuse detection.
 */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessTokenExpiresAt - REFRESH_SKEW_MS) {
    return accessToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const payload = await callRefresh();
      if (!payload?.token) {
        await forgetSession();
        sessionLostHandler?.();
        return null;
      }
      await adoptSession(payload);
      return accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

/**
 * Restore a session on app start.
 *
 * Returns the full session payload so the caller can hydrate app state without
 * a second round trip, or null when there is no restorable session.
 */
export async function restoreSession(): Promise<SessionResponse | null> {
  // Anything an older build left in web storage is cleared before we do
  // anything else.
  purgeLegacyTokenStorage();

  const payload = await callRefresh();
  if (!payload?.token) {
    await forgetSession();
    return null;
  }
  await adoptSession(payload);
  return payload;
}

/** Drop local session material without contacting the server. */
export async function forgetSession(): Promise<void> {
  accessToken = null;
  accessTokenExpiresAt = 0;
  await clearRefreshToken();
  purgeLegacyTokenStorage();
}

/**
 * Sign out. Revokes the refresh token server-side so it cannot be reused, then
 * clears local state — in that order, because a token we can no longer present
 * is a token we can no longer revoke.
 */
export async function endSession(): Promise<void> {
  const stored = isNativePlatform() ? await loadRefreshToken() : null;
  try {
    await fetch(env.API_BASE_URL + "/api/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isNativePlatform() ? { "X-Client-Platform": "native" } : {}),
      },
      credentials: "include",
      body: JSON.stringify(stored ? { refreshToken: stored } : {}),
    });
  } catch {
    // Network failure must not leave credentials on the device.
  }
  await forgetSession();
}

/** Test seam: reset module state between cases. */
export function __resetSessionForTests(): void {
  accessToken = null;
  accessTokenExpiresAt = 0;
  refreshInFlight = null;
  sessionLostHandler = null;
}
