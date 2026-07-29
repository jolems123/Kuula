/**
 * C-06 (approval idempotency) — through the real admin and loan routes.
 *
 * "Two server instances process the same request" is modelled by two concurrent
 * requests to two independently mounted app instances sharing one database,
 * which is exactly what a load-balanced deployment looks like from Postgres's
 * point of view.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import {
  prisma,
  resetDatabase,
  createUser,
  stubProvider,
  type ProviderStub,
} from "../test/helpers.js";
import adminRoutes from "./admin.js";
import loanRoutes from "./loans.js";
import { errorHandler } from "../middleware/error-handler.js";
import { config } from "../lib/config.js";

let provider: ProviderStub;
let realFetch: typeof globalThis.fetch;
const servers: Server[] = [];

/** Boot an independent instance of the API, as a second pod would be. */
async function startInstance(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  app.use("/api/loans", loanRoutes);
  app.use(errorHandler);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function tokenFor(userId: string, role: string): string {
  return jwt.sign({ userId, role }, config.auth.jwtSecret, { expiresIn: "15m" });
}

async function post(base: string, path: string, token: string, body: unknown = {}) {
  const res = await realFetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

beforeEach(async () => {
  await resetDatabase();
  realFetch = globalThis.fetch;
  provider = stubProvider();
});

afterEach(async () => {
  provider.restore();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function pendingApplication(userId: string) {
  return prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: "Test Borrower",
      amount: BigInt(500_000),
      total: BigInt(600_000),
      interest: BigInt(100_000),
      termDays: 90,
      status: "pending",
    },
  });
}

describe("approval concurrency (C-06)", () => {
  it("approval creates an offer and moves no money", async () => {
    const base = await startInstance();
    const admin = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);

    const res = await post(base, `/api/admin/loans/${app.id}/approve`, tokenFor(admin.id, "admin"));

    expect(res.status).toBe(200);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    // Before the fix this credited a wallet and wrote a completed disbursement.
    expect(after.status).toBe("offered");
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.wallet.count()).toBe(0);
    expect(await prisma.repayment.count()).toBe(0);
  });

  it("two admins approving simultaneously produce one decision", async () => {
    const base = await startInstance();
    const adminA = await createUser({ role: "admin" });
    const adminB = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);

    const [a, b] = await Promise.all([
      post(base, `/api/admin/loans/${app.id}/approve`, tokenFor(adminA.id, "admin")),
      post(base, `/api/admin/loans/${app.id}/approve`, tokenFor(adminB.id, "admin")),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await prisma.repayment.count()).toBe(0);
    expect(await prisma.notification.count({ where: { userId: borrower.id } })).toBe(1);
  });

  it("the same admin double-clicking produces one decision", async () => {
    const base = await startInstance();
    const admin = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);
    const token = tokenFor(admin.id, "admin");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(base, `/api/admin/loans/${app.id}/approve`, token))
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: borrower.id } })).toBe(1);
  });

  it("a client retry after a successful approval is refused", async () => {
    const base = await startInstance();
    const admin = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);
    const token = tokenFor(admin.id, "admin");

    const first = await post(base, `/api/admin/loans/${app.id}/approve`, token);
    const retry = await post(base, `/api/admin/loans/${app.id}/approve`, token);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
  });

  it("two server instances processing the same approval produce one decision", async () => {
    const [baseA, baseB] = [await startInstance(), await startInstance()];
    const admin = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);
    const token = tokenFor(admin.id, "admin");

    const [a, b] = await Promise.all([
      post(baseA, `/api/admin/loans/${app.id}/approve`, token),
      post(baseB, `/api/admin/loans/${app.id}/approve`, token),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.notification.count({ where: { userId: borrower.id } })).toBe(1);
  });

  it("approve and reject racing each other yield exactly one outcome", async () => {
    const base = await startInstance();
    const admin = await createUser({ role: "admin" });
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);
    const token = tokenFor(admin.id, "admin");

    const [a, r] = await Promise.all([
      post(base, `/api/admin/loans/${app.id}/approve`, token),
      post(base, `/api/admin/loans/${app.id}/reject`, token, { decisionNotes: "insufficient income" }),
    ]);

    expect([a.status, r.status].sort()).toEqual([200, 409]);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(["offered", "rejected"]).toContain(after.status);
  });

  it("a non-admin cannot approve", async () => {
    const base = await startInstance();
    const borrower = await createUser();
    const app = await pendingApplication(borrower.id);

    const res = await post(base, `/api/admin/loans/${app.id}/approve`, tokenFor(borrower.id, "user"));

    expect(res.status).toBe(403);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("pending");
  });
});

describe("acceptance concurrency across instances (C-06)", () => {
  it("two instances accepting the same offer produce one payout", async () => {
    const [baseA, baseB] = [await startInstance(), await startInstance()];
    const borrower = await createUser();
    const app = await prisma.loanApplication.create({
      data: {
        applicantId: borrower.id,
        applicantName: "Test Borrower",
        amount: BigInt(500_000),
        total: BigInt(600_000),
        termDays: 90,
        status: "offered",
        decidedAt: new Date(),
      },
    });
    const token = tokenFor(borrower.id, "user");

    const [a, b] = await Promise.all([
      post(baseA, `/api/loans/${app.id}/accept`, token),
      post(baseB, `/api/loans/${app.id}/accept`, token),
    ]);

    const fresh = [a, b].filter((r) => r.body?.disbursement?.status === "pending");
    expect(fresh).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { type: "loan_disbursement" } })).toBe(1);
  });

  it("a borrower cannot accept another borrower's offer", async () => {
    const base = await startInstance();
    const owner = await createUser();
    const attacker = await createUser();
    const app = await prisma.loanApplication.create({
      data: {
        applicantId: owner.id,
        applicantName: "Owner",
        amount: BigInt(500_000),
        total: BigInt(600_000),
        termDays: 90,
        status: "offered",
        decidedAt: new Date(),
      },
    });

    const res = await post(base, `/api/loans/${app.id}/accept`, tokenFor(attacker.id, "user"));

    expect(res.status).toBe(404);
    expect(provider.calls).toHaveLength(0);
  });
});
