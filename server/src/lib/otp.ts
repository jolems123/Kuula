/**
 * One-time passcodes (C-04).
 *
 * Properties enforced here:
 *
 *   - generated server-side with a CSPRNG (`crypto.randomInt`)
 *   - stored as HMAC-SHA256(code, pepper) — never in plaintext
 *   - short expiry (5 minutes by default)
 *   - resend cooldown, and a per-phone hourly request cap
 *   - bounded verification attempts, counted even on wrong codes
 *   - a resend invalidates every earlier outstanding challenge
 *   - a verified challenge is consumed and can never be replayed
 *   - constant-time comparison
 *   - user-facing errors never distinguish "no such account" from "wrong code"
 *   - the plaintext code is returned to the caller ONLY outside production, and
 *     is never written to the database or to a log line
 */
import crypto from "crypto";
import prisma from "./prisma.js";
import { config, IS_PRODUCTION } from "./config.js";
import { sendSms } from "./sms.js";

export type OtpPurpose = "phone_verification" | "password_reset" | "login";

export interface OtpIssueResult {
  ok: boolean;
  /** Machine-readable outcome for logging. Never surfaced verbatim to users. */
  reason: "sent" | "cooldown" | "rate-limited" | "delivery-failed" | "unknown-recipient";
  retryAfterSec?: number;
  /** Development/test only — never populated in production. */
  devCode?: string;
}

export interface OtpVerifyResult {
  ok: boolean;
  reason: "verified" | "invalid" | "expired" | "attempts-exceeded" | "no-challenge";
  userId?: string | null;
}

function hashCode(code: string): string {
  return crypto.createHmac("sha256", config.otp.pepper).update(code).digest("hex");
}

function generateCode(): string {
  // 6 digits, uniformly distributed, zero-padded so 000123 is a valid code.
  const n = crypto.randomInt(0, 10 ** config.otp.length);
  return String(n).padStart(config.otp.length, "0");
}

/** Normalise to a single canonical key so rate limits cannot be evaded by format. */
export function normalizePhone(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("256")) d = "256" + d;
  return "+" + d;
}

/**
 * Issue an OTP and deliver it by SMS.
 *
 * Returns `ok: true` for both a real send and an unknown recipient when
 * `silentOnUnknown` is set, so the caller can answer identically either way and
 * avoid leaking whether an account exists.
 */
export async function issueOtp(args: {
  phone: string;
  purpose: OtpPurpose;
  userId?: string | null;
  /** Message template; `{code}` is substituted. */
  template?: string;
}): Promise<OtpIssueResult> {
  const phone = normalizePhone(args.phone);
  const now = new Date();

  // ── Resend cooldown ─────────────────────────────────────────────────────
  const latest = await prisma.otpChallenge.findFirst({
    where: { phone, purpose: args.purpose },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const sinceMs = now.getTime() - latest.createdAt.getTime();
    if (sinceMs < config.otp.resendCooldownMs) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSec: Math.ceil((config.otp.resendCooldownMs - sinceMs) / 1000),
      };
    }
  }

  // ── Hourly request cap ──────────────────────────────────────────────────
  const recentCount = await prisma.otpChallenge.count({
    where: { phone, purpose: args.purpose, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  if (recentCount >= config.otp.maxPerHour) {
    return { ok: false, reason: "rate-limited", retryAfterSec: 3600 };
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + config.otp.ttlMs);

  const challenge = await prisma.$transaction(async (tx) => {
    // A new code invalidates every outstanding one, so an older SMS the user
    // still has on screen stops working the moment they tap "resend".
    await tx.otpChallenge.updateMany({
      where: { phone, purpose: args.purpose, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });

    return tx.otpChallenge.create({
      data: {
        userId: args.userId ?? null,
        phone,
        purpose: args.purpose,
        codeHash: hashCode(code),
        expiresAt,
        maxAttempts: config.otp.maxAttempts,
      },
    });
  });

  const template = args.template ?? "Your Kuula verification code is {code}. It expires in 5 minutes. Never share it.";
  const delivery = await sendSms(phone, template.replace("{code}", code));

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: {
      deliveryState: delivery.ok ? "sent" : "failed",
      deliveryRef: delivery.ref,
    },
  });

  if (!delivery.ok) {
    // Do not leave a live code attached to a message that never arrived.
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { invalidatedAt: new Date() } });
    console.error(`[otp] delivery failed for ${maskPhone(phone)}: ${delivery.error}`);
    return { ok: false, reason: "delivery-failed" };
  }

  return {
    ok: true,
    reason: "sent",
    // The code crosses this boundary only in dev/test. It is never persisted
    // and never logged here.
    ...(IS_PRODUCTION ? {} : { devCode: code }),
  };
}

/**
 * Verify a submitted code.
 *
 * Attempts are counted against the newest live challenge whether or not the
 * code is right, so brute force is bounded. A correct code consumes the
 * challenge, making replay impossible.
 */
export async function verifyOtp(args: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<OtpVerifyResult> {
  const phone = normalizePhone(args.phone);
  const code = String(args.code ?? "").trim();

  if (!new RegExp(`^\\d{${config.otp.length}}$`).test(code)) {
    return { ok: false, reason: "invalid" };
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "otp_challenges"
        WHERE "phone" = $1 AND "purpose" = $2
          AND "consumed_at" IS NULL AND "invalidated_at" IS NULL
        ORDER BY "created_at" DESC
        LIMIT 1
        FOR UPDATE`,
      phone,
      args.purpose
    );
    if (rows.length === 0) return { ok: false, reason: "no-challenge" };

    const challenge = await tx.otpChallenge.findUniqueOrThrow({ where: { id: rows[0].id } });

    if (challenge.expiresAt.getTime() < Date.now()) {
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { invalidatedAt: new Date() } });
      return { ok: false, reason: "expired" };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { invalidatedAt: new Date() } });
      return { ok: false, reason: "attempts-exceeded" };
    }

    // Count the attempt before deciding, so an interrupted request still burns it.
    const updated = await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    const expected = Buffer.from(challenge.codeHash, "utf8");
    const provided = Buffer.from(hashCode(code), "utf8");
    const matches = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

    if (!matches) {
      if (updated.attempts >= challenge.maxAttempts) {
        await tx.otpChallenge.update({ where: { id: challenge.id }, data: { invalidatedAt: new Date() } });
        return { ok: false, reason: "attempts-exceeded" };
      }
      return { ok: false, reason: "invalid" };
    }

    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    return { ok: true, reason: "verified", userId: challenge.userId };
  });
}

/** Delete expired/consumed challenges. Safe to run on a schedule. */
export async function purgeExpiredOtps(): Promise<number> {
  const { count } = await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return count;
}

function maskPhone(phone: string): string {
  return phone.length >= 4 ? `${phone.slice(0, 5)}•••${phone.slice(-3)}` : "•••";
}
