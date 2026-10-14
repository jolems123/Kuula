import test from "node:test";
import assert from "node:assert/strict";
import prisma from "./prisma.js";
import { hashRefreshToken, rotateRefreshSession } from "./sessions.js";

test("a refresh token can be claimed once and cannot revive a logged-out session", async () => {
  const originalFind = prisma.authSession.findUnique;
  const originalUpdate = prisma.authSession.updateMany;
  const token = "synthetic-refresh-token-for-concurrency-test";
  let hash = hashRefreshToken(token);
  let revoked = false;
  (prisma.authSession as any).findUnique = async () => ({
    id: "test-session", refreshTokenHash: hash, revokedAt: null,
    expiresAt: new Date(Date.now() + 900000),
    user: { id: "test-user", deletedAt: null, phoneVerified: true },
  });
  (prisma.authSession as any).updateMany = async ({ where, data }: any) => {
    assert.equal(where.revokedAt, null);
    assert.ok(where.expiresAt.gt instanceof Date);
    if (revoked || where.refreshTokenHash !== hash) return { count: 0 };
    hash = data.refreshTokenHash;
    return { count: 1 };
  };
  try {
    const results = await Promise.all([rotateRefreshSession(token), rotateRefreshSession(token)]);
    assert.equal(results.filter(Boolean).length, 1);
    const nextToken = results.find(Boolean)!.refreshToken;
    revoked = true;
    assert.equal(await rotateRefreshSession(nextToken), null);
    (prisma.authSession as any).findUnique = async () => ({
      revokedAt: null, expiresAt: new Date(Date.now() + 900000), user: { deletedAt: null, phoneVerified: false },
    });
    assert.equal(await rotateRefreshSession(nextToken), null);
  } finally {
    (prisma.authSession as any).findUnique = originalFind;
    (prisma.authSession as any).updateMany = originalUpdate;
  }
});
