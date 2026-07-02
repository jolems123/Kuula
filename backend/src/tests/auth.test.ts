/**
 * Auth flow tests: signup → verify-otp → me → refresh → logout.
 *
 * Run with: DATABASE_URL=postgres://kuula:kuula@localhost:5432/kuula_test npm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrapTest, type TestContext } from "./bootstrap.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await bootstrapTest();
}, 30000);

afterAll(async () => {
  await ctx?.cleanup();
}, 30000);

describe("auth flow", () => {
  it("GET /api/health returns ok", async () => {
    const res = await ctx.request.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/auth/login with valid PIN succeeds", async () => {
    const res = await ctx.request
      .post("/api/auth/login")
      .send({ phone: "+256 770 123 456", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.refreshToken).toBeTypeOf("string");
    expect(res.body.role).toBe("user");
    expect(res.body.user.fullName).toBe("Amara Nakato");
    expect(res.body.credit.score).toBeTypeOf("number");
  });

  it("POST /api/auth/login with wrong PIN fails", async () => {
    const res = await ctx.request
      .post("/api/auth/login")
      .send({ phone: "+256 770 123 456", pin: "9999" });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/admin-login with valid creds succeeds", async () => {
    const res = await ctx.request
      .post("/api/auth/admin-login")
      .send({ email: "admin@kuula.ug", password: "kuula-admin-2026" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
    expect(res.body.credit).toBeNull();
  });

  it("GET /api/me with valid token returns session", async () => {
    const res = await ctx.request
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${ctx.userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("KUU-2024-001847");
  });

  it("GET /api/me without token fails", async () => {
    const res = await ctx.request.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/refresh rotates tokens", async () => {
    const login = await ctx.request
      .post("/api/auth/login")
      .send({ phone: "+256 770 123 456", pin: "1234" });
    const refresh = await ctx.request
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.token).not.toBe(login.body.token);
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it("POST /api/auth/signup with invalid phone fails validation", async () => {
    const res = await ctx.request
      .post("/api/auth/signup")
      .send({ name: "Test User", phone: "123", email: "test@x.com", password: "password123", nationalId: "1234567890" });
    expect(res.status).toBe(400);
  });
});
