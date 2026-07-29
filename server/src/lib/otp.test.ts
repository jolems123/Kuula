/**
 * C-04 (real OTP delivery) and C-03 (session lifecycle).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase, createUser } from "../test/helpers.js";
import { issueOtp, verifyOtp, normalizePhone } from "./otp.js";
import { sentMessages, resetSentMessages } from "./sms.js";
import { issueSession, rotateSession, revokeSession, revokeAllSessions } from "./sessions.js";
import { config } from "./config.js";

const PHONE = "+256770111222";

beforeEach(async () => {
  await resetDatabase();
  resetSentMessages();
});

/** Read the code out of the delivered SMS, the way a real handset would. */
function codeFromSms(phone = PHONE): string {
  const msg = [...sentMessages].reverse().find((m) => m.to === normalizePhone(phone));
  const match = msg?.body.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`no OTP delivered to ${phone}`);
  return match[1];
}

describe("OTP issuance", () => {
  it("delivers a code by SMS instead of logging it", async () => {
    const result = await issueOtp({ phone: PHONE, purpose: "phone_verification" });

    expect(result.ok).toBe(true);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].to).toBe(PHONE);
    expect(codeFromSms()).toMatch(/^\d{6}$/);
  });

  it("stores the code hashed, never in plaintext", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();

    const challenge = await prisma.otpChallenge.findFirstOrThrow({ where: { phone: PHONE } });
    expect(challenge.codeHash).not.toContain(code);
    expect(challenge.codeHash).toMatch(/^[a-f0-9]{64}$/);

    // And nothing anywhere on the row leaks it.
    expect(JSON.stringify(challenge)).not.toContain(code);
  });

  it("never writes the code to the deprecated plaintext user columns", async () => {
    const user = await createUser({ phone: PHONE });
    await issueOtp({ phone: PHONE, purpose: "phone_verification", userId: user.id });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.otpCode).toBeNull();
    expect(after.otpExpiresAt).toBeNull();
  });

  it("sets a short expiry", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const challenge = await prisma.otpChallenge.findFirstOrThrow({ where: { phone: PHONE } });

    const ttlMs = challenge.expiresAt.getTime() - challenge.createdAt.getTime();
    expect(ttlMs).toBeLessThanOrEqual(config.otp.ttlMs + 1000);
    expect(ttlMs).toBeGreaterThan(0);
  });

  it("enforces a resend cooldown", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const second = await issueOtp({ phone: PHONE, purpose: "phone_verification" });

    expect(second.ok).toBe(false);
    expect(second.reason).toBe("cooldown");
    expect(second.retryAfterSec).toBeGreaterThan(0);
    expect(sentMessages).toHaveLength(1);
  });

  it("enforces an hourly request cap", async () => {
    // Backdate each issue past the cooldown so only the hourly cap can bite.
    for (let i = 0; i < config.otp.maxPerHour; i++) {
      const r = await issueOtp({ phone: PHONE, purpose: "phone_verification" });
      expect(r.ok).toBe(true);
      await prisma.otpChallenge.updateMany({
        where: { phone: PHONE },
        data: { createdAt: new Date(Date.now() - 10 * 60_000) },
      });
    }

    const capped = await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    expect(capped.ok).toBe(false);
    expect(capped.reason).toBe("rate-limited");
  });

  it("invalidates the previous code on resend", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const firstCode = codeFromSms();

    await prisma.otpChallenge.updateMany({
      where: { phone: PHONE },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const secondCode = codeFromSms();
    expect(secondCode).not.toBe(firstCode);

    // The SMS still sitting on the user's screen must stop working.
    const stale = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code: firstCode });
    expect(stale.ok).toBe(false);

    const fresh = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code: secondCode });
    expect(fresh.ok).toBe(true);
  });
});

describe("OTP verification", () => {
  it("accepts the correct code exactly once", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();

    const first = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code });
    expect(first.ok).toBe(true);

    // Replay of a consumed code must fail.
    const replay = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code });
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe("no-challenge");
  });

  it("rejects a wrong code", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();
    const wrong = code === "000000" ? "111111" : "000000";

    const result = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code: wrong });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid");
  });

  it("rejects an expired code", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();
    await prisma.otpChallenge.updateMany({
      where: { phone: PHONE },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("locks out after the attempt limit, even if the right code follows", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < config.otp.maxAttempts; i++) {
      await verifyOtp({ phone: PHONE, purpose: "phone_verification", code: wrong });
    }

    const withCorrect = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code });
    expect(withCorrect.ok).toBe(false);
  });

  it("rejects a malformed code without consuming an attempt", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });

    const result = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code: "abc" });
    expect(result.ok).toBe(false);

    const challenge = await prisma.otpChallenge.findFirstOrThrow({ where: { phone: PHONE } });
    expect(challenge.attempts).toBe(0);
  });

  it("does not accept a code issued for a different purpose", async () => {
    await issueOtp({ phone: PHONE, purpose: "password_reset" });
    const code = codeFromSms();

    const result = await verifyOtp({ phone: PHONE, purpose: "phone_verification", code });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-challenge");
  });

  it("does not accept another phone's code", async () => {
    await issueOtp({ phone: PHONE, purpose: "phone_verification" });
    const code = codeFromSms();

    const result = await verifyOtp({ phone: "+256770999888", purpose: "phone_verification", code });
    expect(result.ok).toBe(false);
  });
});

describe("sessions (C-03)", () => {
  it("issues a short-lived access token and stores the refresh token hashed", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });

    expect(session.accessToken.split(".")).toHaveLength(3);
    expect(session.accessTokenExpiresIn).toBeLessThanOrEqual(15 * 60);

    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(session.refreshToken);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rotates the refresh token on use", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });

    const rotated = await rotateSession(session.refreshToken);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.session.refreshToken).not.toBe(session.refreshToken);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });

    const first = await rotateSession(session.refreshToken);
    expect(first.ok).toBe(true);

    // The attacker (or a confused client) replays the already-used token.
    const replay = await rotateSession(session.refreshToken);
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.reason).toBe("reused");

    // Both parties are now locked out — the legitimate successor too.
    if (!first.ok) return;
    const successor = await rotateSession(first.session.refreshToken);
    expect(successor.ok).toBe(false);
  });

  it("rejects a rotated token after logout", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });

    await revokeSession(session.refreshToken);

    const after = await rotateSession(session.refreshToken);
    expect(after.ok).toBe(false);
  });

  it("rejects an expired refresh token", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const after = await rotateSession(session.refreshToken);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.reason).toBe("expired");
  });

  it("keeps devices independent and can revoke them all at once", async () => {
    const user = await createUser();
    const phone = await issueSession({ userId: user.id, role: "user", deviceLabel: "phone" });
    const tablet = await issueSession({ userId: user.id, role: "user", deviceLabel: "tablet" });

    // Signing out one device leaves the other working.
    await revokeSession(phone.refreshToken);
    expect((await rotateSession(phone.refreshToken)).ok).toBe(false);
    expect((await rotateSession(tablet.refreshToken)).ok).toBe(true);

    // Sign-out-everywhere kills what is left.
    const laptop = await issueSession({ userId: user.id, role: "user", deviceLabel: "laptop" });
    await revokeAllSessions(user.id);
    expect((await rotateSession(laptop.refreshToken)).ok).toBe(false);
  });

  it("concurrent refreshes of one token yield exactly one new session", async () => {
    const user = await createUser();
    const session = await issueSession({ userId: user.id, role: "user" });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => rotateSession(session.refreshToken))
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
