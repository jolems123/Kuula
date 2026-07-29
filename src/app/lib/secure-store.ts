/**
 * Platform-secure credential storage (C-03).
 *
 * The old code kept the session JWT in `localStorage`, where any XSS could read
 * it, any Android backup could exfiltrate it, and nothing could revoke it.
 *
 * The replacement differs by platform, because the right answer differs:
 *
 *   WEB — nothing sensitive is stored by JavaScript at all. The refresh token
 *   lives in an httpOnly, Secure, SameSite cookie set by the server, which
 *   script cannot read. The access token is held in a module variable and dies
 *   with the tab. Moving the token from localStorage to sessionStorage or
 *   IndexedDB would have been the same bug with a different name, so we didn't.
 *
 *   NATIVE (Capacitor iOS/Android) — a cross-origin cookie is unreliable in a
 *   WebView (iOS ITP treats the API host as third-party), so the refresh token
 *   is returned in the response body and written to the OS keystore:
 *   the iOS Keychain and the Android Keystore-backed EncryptedSharedPreferences,
 *   via `capacitor-secure-storage-plugin`.
 *
 * If the native plugin is somehow unavailable, this module refuses to persist
 * rather than silently downgrading to web storage. The user stays signed in for
 * the life of the process and is asked to sign in again next launch — degraded,
 * but never insecure.
 */

const KEY = "kuula_refresh_token";

interface SecureStoragePluginApi {
  get(options: { key: string }): Promise<{ value: string }>;
  set(options: { key: string; value: string }): Promise<{ value: boolean }>;
  remove(options: { key: string }): Promise<{ value: boolean }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { SecureStoragePlugin?: SecureStoragePluginApi };
}

function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True inside the iOS/Android Capacitor shell, false in a browser. */
export function isNativePlatform(): boolean {
  const cap = capacitor();
  return typeof cap?.isNativePlatform === "function" ? cap.isNativePlatform() : false;
}

function securePlugin(): SecureStoragePluginApi | null {
  return capacitor()?.Plugins?.SecureStoragePlugin ?? null;
}

/**
 * Whether a refresh token can be durably stored on this platform.
 *
 * Web returns false by design: the server holds the refresh token in an
 * httpOnly cookie, so the client has nothing to store.
 */
export function canPersistRefreshToken(): boolean {
  return isNativePlatform() && securePlugin() !== null;
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (!token) return;
  const plugin = securePlugin();
  if (!isNativePlatform() || !plugin) {
    if (isNativePlatform()) {
      console.warn(
        "[secure-store] SecureStoragePlugin unavailable — the session will not survive an app restart. " +
          "Refusing to fall back to insecure storage."
      );
    }
    return;
  }
  try {
    await plugin.set({ key: KEY, value: token });
  } catch (err) {
    console.warn("[secure-store] could not write to the platform keystore", err);
  }
}

export async function loadRefreshToken(): Promise<string | null> {
  const plugin = securePlugin();
  if (!isNativePlatform() || !plugin) return null;
  try {
    const { value } = await plugin.get({ key: KEY });
    return value || null;
  } catch {
    // The plugin throws rather than returning null when the key is absent.
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  const plugin = securePlugin();
  if (!isNativePlatform() || !plugin) return;
  try {
    await plugin.remove({ key: KEY });
  } catch {
    /* already gone */
  }
}

/**
 * Remove session material written by older builds.
 *
 * Anyone upgrading from a version that used `localStorage` still has a
 * long-lived JWT sitting there. Clearing it on first run of the new code closes
 * that window; the token is useless anyway now that the server issues 15-minute
 * access tokens.
 */
export function purgeLegacyTokenStorage(): void {
  const legacyKeys = ["kuula_session_token", "kuula_auth_token", "token", "refreshToken"];
  for (const key of legacyKeys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
