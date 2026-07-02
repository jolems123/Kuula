/**
 * Savings + wallet flow tests.
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

describe("savings flow", () => {
  it("GET /api/savings returns seeded balance", async () => {
    const res = await ctx.request
      .get("/api/savings")
      .set("Authorization", `Bearer ${ctx.userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(340000);
    expect(res.body.aprPercent).toBe(5);
  });

  it("POST /api/savings/deposit increases balance", async () => {
    const res = await ctx.request
      .post("/api/savings/deposit")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 60000 });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(400000);
  });

  it("POST /api/savings/withdraw decreases balance", async () => {
    const res = await ctx.request
      .post("/api/savings/withdraw")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 50000 });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(350000);
  });

  it("POST /api/savings/withdraw more than balance fails", async () => {
    const res = await ctx.request
      .post("/api/savings/withdraw")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 1000000 });
    expect(res.status).toBe(400);
  });
});

describe("wallet flow", () => {
  it("POST /api/wallet/topup increases balance", async () => {
    const res = await ctx.request
      .post("/api/wallet/topup")
      .set("Authorization", `Bearer ${ctx.userToken}`)
      .send({ amount: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBeGreaterThanOrEqual(100000);
  });
});
