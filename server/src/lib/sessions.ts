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
  if (!existing || existing.revokedAt || existing.expiresAt <= now || existing.user.deletedAt) return null;

  const nextToken = newRefreshToken();
  const rotated = await prisma.authSession.update({
    where: { id: existing.id },
    data: {
      refreshTokenHash: hashRefreshToken(nextToken),
      userAgent: userAgent?.slice(0, 255) || existing.userAgent,
      lastUsedAt: now,
      expiresAt: refreshExpiry(now),
    },
  });
  return { session: rotated, user: existing.user, refreshToken: nextToken };
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
