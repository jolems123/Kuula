import crypto from "node:crypto";
import prisma from "./prisma.js";

const REFRESH_SESSION_DAYS = 30;

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

function refreshExpiry(from = new Date()): Date {
  return new Date(from.getTime() + REFRESH_SESSION_DAYS * 86_400_000);
}

export async function createAuthSession(userId: string, userAgent?: string | null) {
  const refreshToken = newRefreshToken();
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: userAgent?.slice(0, 255) || null,
      expiresAt: refreshExpiry(),
    },
  });
  return { session, refreshToken };
}

export async function rotateRefreshSession(rawToken: string, userAgent?: string | null) {
  if (!rawToken || rawToken.length < 32) return null;
  const now = new Date();
  const currentHash = hashRefreshToken(rawToken);
  const existing = await prisma.authSession.findUnique({
    where: { refreshTokenHash: currentHash },
    include: { user: true },
  });
  if (!existing || existing.revokedAt || existing.expiresAt <= now || existing.user.deletedAt || !existing.user.phoneVerified) return null;

  const nextToken = newRefreshToken();
  // Compare-and-swap prevents concurrent replay of the same refresh token and
  // prevents a logout racing this rotation from reviving a revoked session.
  const claimed = await prisma.authSession.updateMany({
    where: { id: existing.id, refreshTokenHash: currentHash, revokedAt: null, expiresAt: { gt: now } },
    data: {
      refreshTokenHash: hashRefreshToken(nextToken),
      userAgent: userAgent?.slice(0, 255) || existing.userAgent,
      lastUsedAt: now,
      expiresAt: refreshExpiry(now),
    },
  });
  if (claimed.count !== 1) return null;
  return { session: { ...existing, refreshTokenHash: hashRefreshToken(nextToken), lastUsedAt: now, expiresAt: refreshExpiry(now) }, user: existing.user, refreshToken: nextToken };
}

export async function revokeAuthSession(sessionId: string, userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllAuthSessions(userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { hashRefreshToken, REFRESH_SESSION_DAYS };
