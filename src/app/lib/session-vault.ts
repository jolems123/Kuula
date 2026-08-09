import { Capacitor } from "@capacitor/core";

export interface StoredSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
}

let nativeMemorySession: StoredSessionTokens | null = null;
const WEB_KEY = "kuula_ephemeral_session_v2";

/**
 * Kuula does not place bearer or refresh tokens in localStorage.
 *
 * Native Capacitor builds keep tokens in memory until a Keychain/Keystore-backed
 * plugin is configured and audited. This intentionally requires re-login after a
 * cold app restart rather than persisting a financial bearer credential in the
 * WebView's ordinary storage. Web builds use sessionStorage, which is cleared at
 * the end of the browser session.
 */
export function storeSessionTokens(tokens: StoredSessionTokens): void {
  if (Capacitor.isNativePlatform()) {
    nativeMemorySession = tokens;
    return;
  }
  try { sessionStorage.setItem(WEB_KEY, JSON.stringify(tokens)); } catch { /* memory-only fallback */ }
}

export function readSessionTokens(): StoredSessionTokens | null {
  if (Capacitor.isNativePlatform()) return nativeMemorySession;
  try {
    const raw = sessionStorage.getItem(WEB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSessionTokens>;
    if (
      typeof parsed.accessToken !== "string"
      || typeof parsed.refreshToken !== "string"
      || typeof parsed.accessExpiresAt !== "number"
    ) return null;
    return parsed as StoredSessionTokens;
  } catch {
    return null;
  }
}

export function clearSessionTokens(): void {
  nativeMemorySession = null;
  try { sessionStorage.removeItem(WEB_KEY); } catch { /* noop */ }
  // Remove the obsolete persistent bearer token if this build upgrades an older install.
  try { localStorage.removeItem("kuula_session_token"); } catch { /* noop */ }
}
