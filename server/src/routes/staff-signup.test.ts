import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";

process.env.JWT_SECRET ||= "test-secret-for-staff-signup-regressions-at-least-64-characters-long";
const { default: prisma } = await import("../lib/prisma.js");
const { default: auth } = await import("./auth.js");
const { default: staff } = await import("./staff.js");
const { errorHandler } = await import("../middleware/error-handler.js");
const { generateToken } = await import("../middleware/auth.js");

test("password-only staff signup cannot grant access or overwrite an existing password", async () => {
  const app = express();
  app.use(express.json(), auth);
  app.use("/staff", staff);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const originalUpdateMany = prisma.user.updateMany;
  const originalFindUnique = prisma.user.findUnique;
  const originalAudit = prisma.auditEvent.create;
  const originalSessionFind = prisma.authSession.findUnique;
  const originalSessionCreate = prisma.authSession.create;
  const originalMessages = prisma.message.findMany;
  const originalNotifications = prisma.notification.count;
  let approved = false;
  let savedHash = "";
  let writes = 0;
  (prisma.user as any).updateMany = async ({ where, data }: any) => {
    assert.equal(where.phoneVerified, false);
    if (where.id) {
      assert.equal(where.id, "pending-staff");
      assert.deepEqual(where.passwordHash, { not: null });
      assert.equal(data.phoneVerified, true);
      approved = true;
      return { count: 1 };
    }
    assert.equal(where.email, "staff@example.com");
    assert.equal(where.passwordHash, null);
    assert.equal(where.deletedAt, null);
    assert.ok(!where.role.in.includes("super_admin"));
    assert.ok(!where.role.in.includes("customer"));
    assert.equal(data.phoneVerified, undefined);
    assert.equal(data.role, undefined);
    assert.equal(data.otpHash, null);
    writes++;
    if (savedHash) return { count: 0 };
    savedHash = data.passwordHash;
    return { count: 1 };
  };
  (prisma.auditEvent as any).create = async () => ({});
  (prisma.authSession as any).findUnique = async ({ where }: any) => ({ id: where.id, userId: "actor", revokedAt: null, expiresAt: new Date(Date.now() + 900000) });
  (prisma.authSession as any).create = async () => ({ id: "new-session" });
  (prisma.message as any).findMany = async () => [];
  (prisma.notification as any).count = async () => 0;
  let actorRole = "administrator";
  (prisma.user as any).findUnique = async ({ where }: any) => where.id === "actor" ? { role: actorRole, authVersion: 1, deletedAt: null, phoneVerified: true } : ({
    id: "pending-staff", role: "loan_officer", email: "staff@example.com",
    phoneVerified: approved, passwordHash: savedHash, deletedAt: null,
    loginAttempts: 0, loginLockedUntil: null, authVersion: 1, fullName: "Test Staff",
  });
  const post = (path: string, body: object, token?: string) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  try {
    const credentials = { email: " Staff@Example.com ", password: "AvalidPassword9", confirmPassword: "AvalidPassword9" };
    assert.equal((await post("/staff-signup", { ...credentials, confirmPassword: "wrong" })).status, 400);
    assert.equal((await post("/staff-signup", { ...credentials, email: "invalid" })).status, 400);
    assert.equal(writes, 0);
    const signup = await post("/staff-signup", credentials);
    assert.equal(signup.status, 201);
    const payload = await signup.json() as any;
    assert.equal(payload.token, undefined);
    assert.equal(payload.refreshToken, undefined);
    assert.match(payload.message, /approve/);
    assert.notEqual(savedHash, credentials.password);
    assert.equal(await bcrypt.compare(credentials.password, savedHash), true);
    assert.equal((await post("/staff-signup", credentials)).status, 409);
    const login = await post("/admin-login", credentials);
    assert.equal(login.status, 403);
    assert.match((await login.json() as any).error, /approval/);
    assert.equal((await post("/verify-phone", { phone: "+256772000001", code: "123456" })).status, 401);
    assert.equal((await post("/staff-invite/activate", credentials)).status, 404);
    assert.equal((await post("/admin-login/verify", {})).status, 404);
    assert.equal((await post("/staff/pending-staff/approve", {})).status, 401);
    const actorToken = () => generateToken({ userId: "actor", role: actorRole as any, authVersion: 1, sessionId: "actor-session" });
    assert.equal((await post("/staff/pending-staff/approve", {}, actorToken())).status, 403);
    assert.equal(approved, false);
    actorRole = "super_admin";
    assert.equal((await post("/staff/pending-staff/approve", {}, actorToken())).status, 200);
    const signedIn = await post("/admin-login", credentials);
    assert.equal(signedIn.status, 200);
    const signedInPayload = await signedIn.json() as any;
    assert.equal(signedInPayload.role, "loan_officer");
    assert.equal(typeof signedInPayload.token, "string");
    assert.equal(typeof signedInPayload.refreshToken, "string");
    assert.equal(signedInPayload.requiresMfa, undefined);
  } finally {
    (prisma.user as any).updateMany = originalUpdateMany;
    (prisma.user as any).findUnique = originalFindUnique;
    (prisma.auditEvent as any).create = originalAudit;
    (prisma.authSession as any).findUnique = originalSessionFind;
    (prisma.authSession as any).create = originalSessionCreate;
    (prisma.message as any).findMany = originalMessages;
    (prisma.notification as any).count = originalNotifications;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
