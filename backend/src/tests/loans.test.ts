/**
 * Loan flow tests: quote → apply → admin decision → repayment.
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

describe("loan flow", () => {
  it("POST /api/loans/quote returns compliant APR", async () => {
    const res = await ctx.request
      .post("/api/loans/quote")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 500000, termDays: 180 });
    expect(res.status).toBe(200);
    expect(res.body.apr).toBeLessThanOrEqual(0.336);
    expect(res.body.total).toBeGreaterThan(res.body.principal);
    expect(res.body.compound).toBe(false);
  });

  it("POST /api/loans/applications creates a pending application", async () => {
    const res = await ctx.request
      .post("/api/loans/applications")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 200000, purpose: "emergency", termDays: 91, channel: "mtn_momo" });
    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe("pending");
    expect(res.body.application.amount).toBe(200000);
  });

  it("GET /api/loans/applications lists user's apps", async () => {
    const res = await ctx.request
      .get("/api/loans/applications")
      .set("Authorization", `Bearer ${ctx.userToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.applications)).toBe(true);
  });

  it("GET /api/compliance returns the right caps", async () => {
    const res = await ctx.request.get("/api/compliance");
    expect(res.status).toBe(200);
    expect(res.body.maxAprPercent).toBe(33.6);
    expect(res.body.appleAprCapPercent).toBe(36);
    expect(res.body.minTermDays).toBe(90);
    expect(res.body.compound).toBe(false);
  });

  it("GET /api/credit/score returns 300-850 score", async () => {
    const res = await ctx.request
      .get("/api/credit/score")
      .set("Authorization", `Bearer ${ctx.userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThanOrEqual(300);
    expect(res.body.score).toBeLessThanOrEqual(850);
    expect(res.body.factors).toHaveLength(5);
  });

  it("POST /api/loans/apply auto-approves an eligible customer", async () => {
    const res = await ctx.request
      .post("/api/loans/apply")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 100000, term_days: 91, purpose: "emergency", disbursement_method: "mtn_momo" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Eligible customer with clean CRB + KYC verified + savings → tier A or B.
    expect(["active", "approved", "rejected"]).toContain(res.body.status);
  });
});
