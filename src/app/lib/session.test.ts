// @vitest-environment jsdom
/**
 * C-03, client half.
 *
 * The point of these tests is not that a token round-trips — it is that no
 * token ever reaches web storage, and that a lost session is detected rather
 * than leaving the UI half-authenticated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  adoptSession,
  getAccessToken,
  peekAccessToken,
  restoreSession,
  endSession,
  forgetSession,
  onSessionLost,
  __resetSessionForTests,
} from "./session";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(async () => {
  __resetSessionForTests();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("token storage", () => {
  it("keeps the access token in memory and out of web storage", async () => {
    await adoptSession({ token: "access-token-abc", expiresIn: 900 });

    expect(peekAccessToken()).toBe("access-token-abc");

    // The whole of C-03: nothing readable by script.
    const dumped = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(dumped).not.toContain("access-token-abc");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("never writes a refresh token to web storage on web", async () => {
    await adoptSession({ token: "access", refreshToken: "refresh-secret-xyz", expiresIn: 900 });

    const dumped = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(dumped).not.toContain("refresh-secret-xyz");
  });

  it("purges tokens left behind by older builds", async () => {
    localStorage.setItem("kuula_session_token", "legacy-jwt-from-old-build");
    localStorage.setItem("kuula_auth_token", "another-legacy-jwt");
    sessionStorage.setItem("token", "third-legacy-jwt");

    mockFetch(() => jsonResponse({ error: "no session" }, 401));
    await restoreSession();

    expect(localStorage.getItem("kuula_session_token")).toBeNull();
    expect(localStorage.getItem("kuula_auth_token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
  });
});

describe("session restoration", () => {
  it("exchanges the refresh cookie for a fresh access token on app start", async () => {
    let calledPath = "";
    let credentials: RequestCredentials | undefined;
    mockFetch((url, init) => {
      calledPath = url;
      credentials = init?.credentials;
      return jsonResponse({ token: "restored-token", expiresIn: 900, role: "user" });
    });

    const restored = await restoreSession();

    expect(restored?.token).toBe("restored-token");
    expect(calledPath).toContain("/api/auth/refresh");
    // Without this the httpOnly refresh cookie is not sent.
    expect(credentials).toBe("include");
  });

  it("returns null when there is nothing to restore", async () => {
    mockFetch(() => jsonResponse({ error: "expired" }, 401));

    expect(await restoreSession()).toBeNull();
    expect(peekAccessToken()).toBeNull();
  });
});

describe("token refresh", () => {
  it("returns the cached token while it is still fresh", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ token: "should-not-be-used" }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adoptSession({ token: "still-good", expiresIn: 900 });

    expect(await getAccessToken()).toBe("still-good");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes transparently once the token is near expiry", async () => {
    mockFetch(() => jsonResponse({ token: "rotated-token", expiresIn: 900 }));
    // 30s of life left, inside the 60s refresh skew.
    await adoptSession({ token: "nearly-expired", expiresIn: 30 });

    expect(await getAccessToken()).toBe("rotated-token");
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse({ token: `rotated-${calls}`, expiresIn: 900 });
    });
    await adoptSession({ token: "expiring", expiresIn: 1 });

    const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

    // Rotating three times would trip the server's token-reuse detection and
    // log the user out.
    expect(calls).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it("notifies the app and clears state when the session cannot be refreshed", async () => {
    const lost = vi.fn();
    onSessionLost(lost);
    mockFetch(() => jsonResponse({ error: "revoked" }, 401));
    await adoptSession({ token: "expiring", expiresIn: 1 });

    expect(await getAccessToken()).toBeNull();
    expect(lost).toHaveBeenCalledOnce();
    expect(peekAccessToken()).toBeNull();
  });
});

describe("logout", () => {
  it("revokes server-side before clearing local state", async () => {
    let signOutCalled = false;
    mockFetch((url) => {
      if (url.includes("/api/auth/signout")) signOutCalled = true;
      return jsonResponse({ ok: true });
    });
    await adoptSession({ token: "live-token", expiresIn: 900 });

    await endSession();

    expect(signOutCalled).toBe(true);
    expect(peekAccessToken()).toBeNull();
  });

  it("clears credentials even when the network call fails", async () => {
    mockFetch(() => {
      throw new Error("offline");
    });
    await adoptSession({ token: "live-token", expiresIn: 900 });

    await endSession();

    expect(peekAccessToken()).toBeNull();
  });

  it("forgetSession drops everything without a network call", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adoptSession({ token: "live-token", expiresIn: 900 });

    await forgetSession();

    expect(peekAccessToken()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
