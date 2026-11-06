// Isolated CI only: exercise the real TLS SMTP client, staff MFA and recovery.
import assert from "node:assert/strict";
import tls from "node:tls";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const db = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(["localhost", "127.0.0.1"].includes(db.hostname) && /test/.test(db.pathname), "Requires an isolated local test database");
const prisma = new PrismaClient();
let rejectAuth = false, accepted = 0;
const sockets = new Set();
const smtp = tls.createServer({ key: fs.readFileSync(process.env.TEST_SMTP_KEY), cert: fs.readFileSync(process.env.TEST_SMTP_CERT) }, socket => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => {});
  socket.write("220 localhost SMTP ready\r\n");
  let buffer = "", auth = 0, data = false;
  socket.on("data", chunk => {
    buffer += chunk.toString();
    for (;;) {
      const end = buffer.indexOf("\r\n");
      if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === ".") { data = false; accepted++; socket.write("250 accepted\r\n"); }
      } else if (auth) {
        if (auth === 1) { auth = 2; socket.write("334 password\r\n"); }
        else { auth = 0; socket.write(rejectAuth ? "535 rejected\r\n" : "235 authenticated\r\n"); }
      } else if (line.startsWith("EHLO")) socket.write("250 localhost\r\n");
      else if (line === "AUTH LOGIN") { auth = 1; socket.write("334 username\r\n"); }
      else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) socket.write("250 ok\r\n");
      else if (line === "DATA") { data = true; socket.write("354 send message\r\n"); }
      else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("500 unsupported\r\n");
    }
  });
});
await new Promise(resolve => smtp.listen(3465, "localhost", resolve));
const email = "mfa-ci@kuula.test", original = "Mfa-CI-Original-Password-2026", changed = "Mfa-CI-Recovered-Password-2026";
const bcrypt = (await import("bcryptjs")).default;
const user = await prisma.user.create({ data: { email, fullName: "CI MFA staff", role: "finance", phoneVerified: true, passwordHash: await bcrypt.hash(original, 10) } });
const smtpPassword = "ci-only-smtp-password-never-log";
let logs = "";
const api = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, PORT: "3001", REAL_MONEY_ENABLED: "false", STAFF_EMAIL_MFA_REQUIRED: "true", SMTP_HOST: "localhost", SMTP_PORT: "3465", SMTP_USER: email, SMTP_PASSWORD: smtpPassword, EMAIL_FROM: "notifications@kuula.test" }, stdio: ["ignore", "pipe", "pipe"] });
for (const stream of [api.stdout, api.stderr]) stream.on("data", data => { logs += data.toString(); });
async function call(path, body, expected = 200, token) {
  const response = await fetch(`http://localhost:3001/api/${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
const cooldown = () => prisma.user.update({ where: { id: user.id }, data: { otpLastSentAt: null } });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { await call("health"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, "MFA API started");
  const challenge = await call("auth/admin-login", { email, password: original });
  assert.equal(challenge.mfaRequired, true);
  assert.equal(challenge.token, undefined);
  assert.equal(accepted, 1, "OTP delivered using the real TLS SMTP client");
  await call("auth/admin-login/verify", { email, code: "000000" }, 401);
  const login = await call("auth/admin-login/verify", { email, code: process.env.TEST_OTP_CODE });
  assert.ok(login.token && login.refreshToken);
  await call("auth/admin-login/verify", { email, code: process.env.TEST_OTP_CODE }, 401);
  await cooldown();
  await call("auth/reset-password", { identifier: email });
  await call("auth/reset-password/confirm", { identifier: email, code: process.env.TEST_OTP_CODE, newPassword: changed });
  await call("auth/me", null, 401, login.token);
  await call("auth/refresh", { refreshToken: login.refreshToken }, 401);
  await call("auth/admin-login", { email, password: original }, 401);
  await call("auth/admin-login", { email, password: changed }, 429);
  await cooldown(); // Advance the isolated fixture past the resend cooldown.
  const recovered = await call("auth/admin-login", { email, password: changed });
  assert.equal(recovered.mfaRequired, true, "Recovery cannot bypass MFA");
  await call("auth/admin-login/verify", { email, code: process.env.TEST_OTP_CODE });
  await cooldown(); rejectAuth = true;
  await call("auth/admin-login", { email, password: changed }, 503);
  const failed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(failed.otpHash, null);
  assert.equal(failed.otpLastSentAt, null, "Delivery failure permits retry without a password-only fallback");
  assert.ok(logs.includes("SMTP command rejected with status 535"), "The rejected-authentication error was observed");
  assert.ok(!logs.includes(smtpPassword) && !logs.includes(Buffer.from(smtpPassword).toString("base64")), "SMTP credentials must never appear in errors");
  console.log("Staff MFA, recovery, revocation, replay and SMTP failure controls passed (isolated CI)");
} finally {
  api.kill("SIGTERM");
  await new Promise(resolve => api.exitCode !== null ? resolve() : api.once("exit", resolve));
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => smtp.close(resolve));
  await prisma.$disconnect();
}
