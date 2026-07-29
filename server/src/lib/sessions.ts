/**
 * Session management (C-03, server half).
 *
 * The old design handed the client one long-lived (24h) JWT which the web app
 * parked in `localStorage`, where any XSS could read it and nothing could
 * revoke it.
 *
 * The new design splits authority:
 *
 *   - ACCESS TOKEN  — JWT, 15 minutes, held in memory by the client only. Short
 *     enough that theft has a small window; never written to disk on web.
 *   - REFRESH TOKEN — opaque 256-bit random string, stored HASHED here so a
 *     database leak cannot mint sessions. Rotated on every use, revocable
 *     individually or per user (all devices).
 *
 * Rotation gives stolen-token detection for free: refresh tokens are
 * single-use, so if one is presented twice, either the legitimate client or an
 * attacker is replaying. We cannot tell which, so the entire token family is
 * revoked and both are forced to re-authenticate.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "./prisma.js";
import { config } from "./config.js";
import type { JwtPayload, UserRole } from "../middleware/auth.js";

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

/** Seconds until the access token expires, for the client's refresh timer. */
function accessTtlSeconds(): number {
  const decoded = jwt.decode(signAccessToken({ userId: "0", role: "user" })) as { exp?: number; iat?: number } | null;
  if (decoded?.exp && decoded?.iat) return decoded.exp - decoded.iat;
  return 900;
}

/** Start a new session (login, or a completed OTP verification). */
export async function issueSession(args: {
  userId: string;
  role: UserRole;
  deviceLabel?: string | null;
}): Promise<IssuedSession> {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + config.auth.refreshTokenTtlMs);
  const familyId = crypto.randomUUID();

  await prisma.refreshToken.create({
    data: {
      userId: args.userId,
      tokenHash: hashToken(refreshToken),
      familyId,
      deviceLabel: args.deviceLabel?.slice(0, 120) ?? null,
      expiresAt,
    },
  });

  return {
    accessToken: signAccessToken({ userId: args.userId, role: args.role }),
    refreshToken,
    accessTokenExpiresIn: accessTtlSeconds(),
    refreshTokenExpiresAt: expiresAt,
  };
}

export type RefreshOutcome =
  | { ok: true; session: IssuedSession; userId: string; role: UserRole }
  | { ok: false; reason: "unknown" | "expired" | "revoked" | "reused" };

/**
 * Exchange a refresh token for a new pair, rotating the old one.
 *
 * The rotation is a compare-and-set inside a transaction: two concurrent
 * refreshes from the same token serialise, and only the first one succeeds.
 */
export async function rotateSession(rawToken: string, deviceLabel?: string | null): Promise<RefreshOutcome> {
  const tokenHash = hashToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, role: true, deletedAt: true } } },
  });

  if (!existing || !existing.user || existing.user.deletedAt) return { ok: false, reason: "unknown" };

  if (existing.revokedAt) {
    // Single-use token presented again. Someone is replaying — we cannot tell
    // whether it is the attacker or the victim, so we revoke the whole family.
    await revokeFamily(existing.familyId);
    return { ok: false, reason: "reused" };
  }
  if (existing.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const nextToken = newOpaqueToken();
  const nextExpiry = new Date(Date.now() + config.auth.refreshTokenTtlMs);

  const rotated = await prisma.$transaction(async (tx) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (claim.count === 0) return null; // lost the race to a concurrent refresh

    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(nextToken),
        familyId: existing.familyId,
        deviceLabel: deviceLabel?.slice(0, 120) ?? existing.deviceLabel,
        expiresAt: nextExpiry,
      },
    });
    await tx.refreshToken.update({ where: { id: existing.id }, data: { replacedById: created.id } });
    return created;
  });

  if (!rotated) return { ok: false, reason: "reused" };

  const role = (existing.user.role === "admin" ? "admin" : "user") as UserRole;
  return {
    ok: true,
    userId: existing.userId,
    role,
    session: {
      accessToken: signAccessToken({ userId: existing.userId, role }),
      refreshToken: nextToken,
      accessTokenExpiresIn: accessTtlSeconds(),
      refreshTokenExpiresAt: nextExpiry,
    },
  };
}

/** Log out one device. */
export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke a rotation family after suspected token theft. */
export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Log out every device for a user (password change, account deletion, abuse). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}

/** Delete refresh tokens that expired long ago. Safe to run on a schedule. */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
  return count;
}

// ── Web cookie transport ───────────────────────────────────────────────────
// On web the refresh token is delivered as an httpOnly cookie so JavaScript —
// and therefore any XSS — cannot read it. Native clients do not use cookies;
// they receive the token in the body and store it in the platform keystore.

export const REFRESH_COOKIE = "kuula_rt";

export function refreshCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "lax" as const,
    path: "/api/auth",
    expires,
    ...(config.auth.cookieDomain ? { domain: config.auth.cookieDomain } : {}),
  };
}
