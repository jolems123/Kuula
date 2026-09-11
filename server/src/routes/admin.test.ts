/**
 * Admin API — RBAC, real-data reads, and the CRUD actions the portal exposes.
 *
 * Runs against the real test database through the real routers, so a change
 * to a query, a mapper or a guard is caught here rather than in production.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { prisma, resetDatabase, createUser, createActiveLoanWithRepayment } from "../test/helpers.js";
import adminRoutes from "./admin.js";
import kycRoutes from "./kyc.js";
import { errorHandler } from "../middleware/error-handler.js";
import { config } from "../lib/config.js";

let base = "";
let server: Server;

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  app.use("/api/kyc", kycRoutes);
  app.use(errorHandler);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await resetDatabase();
});

function tokenFor(userId: string, role: string): string {
  return jwt.sign({ userId, role }, config.auth.jwtSecret, { expiresIn: "15m" });
}

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

async function createAdmin(email = "staff@kuula.test") {
  const admin = await prisma.user.create({
    data: { role: "admin", fullName: "Staff One", email, passwordHash: "$2a$04$abcdefghijklmnopqrstuv", verified: true },
  });
  return { id: admin.id, token: tokenFor(admin.id, "admin") };
}

// Every reachable admin endpoint, for the RBAC sweep.
const ADMIN_GETS = [
  "/api/admin/stats",
  "/api/admin/audit",
  "/api/admin/config",
  "/api/admin/report",
  "/api/admin/report?range=today",
  "/api/admin/investor-report",
  "/api/admin/customers",
  "/api/admin/loans",
  "/api/admin/loans/summary",
  "/api/admin/kyc",
  "/api/admin/kyc/summary",
  "/api/admin/transactions",
  "/api/admin/savings/accounts",
  "/api/admin/savings/transactions",
  "/api/admin/tickets",
  "/api/admin/tickets/summary",
  "/api/admin/staff",
];

describe("admin RBAC", () => {
  it("rejects unauthenticated requests to every admin endpoint with 401", async () => {
    for (const path of ADMIN_GETS) {
      const res = await call("GET", path, null);
      expect(res.status, path).toBe(401);
    }
  });

  it("rejects customer tokens on every admin endpoint with 403", async () => {
    const customer = await createUser();
    const token = tokenFor(customer.id, "user");
    for (const path of ADMIN_GETS) {
      const res = await call("GET", path, token);
      expect(res.status, path).toBe(403);
    }
    const write = await call("POST", "/api/admin/staff", token, { fullName: "x", email: "x@y.z", password: "0123456789" });
    expect(write.status).toBe(403);
  });

  it("serves every admin endpoint to an admin token — no 404/410/500", async () => {
    const { token } = await createAdmin();
    for (const path of ADMIN_GETS) {
      const res = await call("GET", path, token);
      expect(res.status, `${path} -> ${JSON.stringify(res.body)}`).toBe(200);
    }
  });

  it("rejects tampered tokens", async () => {
    const bad = jwt.sign({ userId: "00000000-0000-0000-0000-000000000000", role: "admin" }, "not-the-secret");
    const res = await call("GET", "/api/admin/stats", bad);
    expect(res.status).toBe(401);
  });
});

describe("admin dashboard stats", () => {
  it("returns zeros and an empty recent list on an empty database (no fabricated data)", async () => {
    const { token } = await createAdmin();
    const res = await call("GET", "/api/admin/stats", token);
    expect(res.status).toBe(200);
    expect(res.body.customers).toBe(0);
    expect(res.body.pendingApplications).toBe(0);
    expect(res.body.activeLoans).toBe(0);
    expect(res.body.outstandingPortfolio).toBe(0);
    expect(res.body.savingsTotal).toBe(0);
    expect(res.body.pendingKyc).toBe(0);
    expect(res.body.openTickets).toBe(0);
    expect(res.body.recentApplications).toEqual([]);
  });

  it("derives every figure from database rows", async () => {
    const { token } = await createAdmin();
    const borrower = await createUser();
    await createActiveLoanWithRepayment(borrower.id, { amount: 500_000, total: 600_000 });
    await prisma.user.update({ where: { id: borrower.id }, data: { kycSubmittedAt: new Date() } });
    await prisma.savingsAccount.update({ where: { userId: borrower.id }, data: { balance: 25_000 } });

    const res = await call("GET", "/api/admin/stats", token);
    expect(res.body.customers).toBe(1);
    expect(res.body.activeLoans).toBe(1);
    expect(res.body.outstandingPortfolio).toBe(600_000);
    expect(res.body.savingsTotal).toBe(25_000);
    expect(res.body.pendingKyc).toBe(1);
  });
});

describe("admin customers", () => {
  it("lists, searches and paginates real customers", async () => {
    const { token } = await createAdmin();
    await createUser({ fullName: "Amara Nakato" });
    await createUser({ fullName: "Brian Okello" });
    await createUser({ fullName: "Cynthia Auma" });

    const all = await call("GET", "/api/admin/customers?pageSize=2", token);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.hasMore).toBe(true);

    const page2 = await call("GET", "/api/admin/customers?pageSize=2&page=2", token);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);

    const search = await call("GET", "/api/admin/customers?q=okello", token);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].fullName).toBe("Brian Okello");
  });

  it("never lists staff accounts as customers", async () => {
    const { token } = await createAdmin();
    const res = await call("GET", "/api/admin/customers", token);
    expect(res.body.total).toBe(0);
  });

  it("returns a full profile with loans, repayments, ledger and credit score", async () => {
    const { token } = await createAdmin();
    const borrower = await createUser({ fullName: "Detail Person" });
    const { app } = await createActiveLoanWithRepayment(borrower.id);

    const res = await call("GET", `/api/admin/customers/${borrower.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.customer.fullName).toBe("Detail Person");
    expect(res.body.customer.kycStatus).toBe("not_submitted");
    expect(res.body.loans.map((l: any) => l.id)).toContain(app.id);
    expect(res.body.repayments).toHaveLength(1);
    expect(res.body.credit.score).toBeGreaterThan(0);
    expect(res.body.hasLiveLoan).toBe(true);
    expect(res.body.savings.balance).toBe(0);
  });

  it("404s for unknown customers and 400s for malformed ids", async () => {
    const { token } = await createAdmin();
    expect((await call("GET", "/api/admin/customers/00000000-0000-0000-0000-000000000001", token)).status).toBe(404);
    expect((await call("GET", "/api/admin/customers/not-a-uuid", token)).status).toBe(400);
  });

  it("edits allowed contact fields, persists them and writes an audit entry", async () => {
    const { token, id: adminId } = await createAdmin();
    const customer = await createUser({ fullName: "Old Name" });

    const res = await call("PATCH", `/api/admin/customers/${customer.id}`, token, {
      fullName: "New Name", email: "New@Example.com", district: "Gulu",
    });
    expect(res.status).toBe(200);
    expect(res.body.changed.sort()).toEqual(["district", "email", "fullName"]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.fullName).toBe("New Name");
    expect(row.email).toBe("new@example.com");
    expect(row.district).toBe("Gulu");

    const auditRow = await prisma.auditEvent.findFirst({ where: { action: "customer.updated", entityId: customer.id } });
    expect(auditRow?.actorId).toBe(adminId);
  });

  it("rejects invalid edits and email collisions", async () => {
    const { token } = await createAdmin();
    const a = await createUser();
    const b = await createUser();
    await prisma.user.update({ where: { id: b.id }, data: { email: "taken@example.com" } });

    expect((await call("PATCH", `/api/admin/customers/${a.id}`, token, { fullName: "x" })).status).toBe(400);
    expect((await call("PATCH", `/api/admin/customers/${a.id}`, token, { email: "nope" })).status).toBe(400);
    expect((await call("PATCH", `/api/admin/customers/${a.id}`, token, { email: "taken@example.com" })).status).toBe(409);
  });

  it("deactivates and reactivates without deleting any rows; refuses with a live loan", async () => {
    const { token } = await createAdmin();
    const quiet = await createUser();
    const busy = await createUser();
    await createActiveLoanWithRepayment(busy.id);

    expect((await call("POST", `/api/admin/customers/${quiet.id}/deactivate`, token, {})).status).toBe(400);

    const off = await call("POST", `/api/admin/customers/${quiet.id}/deactivate`, token, { reason: "Customer request" });
    expect(off.status).toBe(200);
    expect(off.body.customer.active).toBe(false);
    expect(await prisma.user.count()).toBe(3);

    const blocked = await call("POST", `/api/admin/customers/${busy.id}/deactivate`, token, { reason: "x" });
    expect(blocked.status).toBe(409);

    const on = await call("POST", `/api/admin/customers/${quiet.id}/reactivate`, token, {});
    expect(on.status).toBe(200);
    expect(on.body.customer.active).toBe(true);
  });
});

describe("admin loans", () => {
  it("lists with status groups and returns repayment state for live loans", async () => {
    const { token } = await createAdmin();
    const borrower = await createUser();
    const { app } = await createActiveLoanWithRepayment(borrower.id, { amount: 300_000, total: 360_000 });
    await prisma.loanApplication.create({
      data: { applicantId: borrower.id, applicantName: "Test Borrower", amount: 100_000n, total: 120_000n, status: "rejected", termDays: 90 },
    });

    const live = await call("GET", "/api/admin/loans?status=live", token);
    expect(live.body.total).toBe(1);
    expect(live.body.items[0].id).toBe(app.id);
    expect(live.body.items[0].repayment.outstanding).toBe(360_000);

    const rejected = await call("GET", "/api/admin/loans?status=rejected", token);
    expect(rejected.body.total).toBe(1);

    const summary = await call("GET", "/api/admin/loans/summary", token);
    expect(summary.body.counts.active).toBe(1);
    expect(summary.body.outstandingPortfolio).toBe(360_000);

    const bad = await call("GET", "/api/admin/loans?status=bogus", token);
    expect(bad.status).toBe(400);
  });

  it("returns a loan detail with applicant, repayments and audit trail", async () => {
    const { token } = await createAdmin();
    const borrower = await createUser({ fullName: "Loan Owner" });
    const { app } = await createActiveLoanWithRepayment(borrower.id);

    const res = await call("GET", `/api/admin/loans/${app.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.loan.status).toBe("active");
    expect(res.body.applicant.fullName).toBe("Loan Owner");
    expect(res.body.repayments).toHaveLength(1);
    expect(Array.isArray(res.body.audit)).toBe(true);
  });

  it("withdraws an unaccepted offer but never a disbursed loan", async () => {
    const { token } = await createAdmin();
    const borrower = await createUser();
    const offer = await prisma.loanApplication.create({
      data: { applicantId: borrower.id, applicantName: "T", amount: 100_000n, total: 120_000n, status: "offered", termDays: 90, decidedAt: new Date() },
    });
    const { app: active } = await createActiveLoanWithRepayment(borrower.id);

    expect((await call("POST", `/api/admin/loans/${offer.id}/withdraw`, token, {})).status).toBe(400);
    const ok = await call("POST", `/api/admin/loans/${offer.id}/withdraw`, token, { decisionNotes: "Duplicate request" });
    expect(ok.status).toBe(200);
    expect(ok.body.application.status).toBe("rejected");

    const refused = await call("POST", `/api/admin/loans/${active.id}/withdraw`, token, { decisionNotes: "x" });
    expect(refused.status).toBe(409);
    expect((await prisma.loanApplication.findUniqueOrThrow({ where: { id: active.id } })).status).toBe("active");
  });
});

describe("admin KYC review", () => {
  async function submitted(fullName = "KYC Person") {
    const u = await createUser({ fullName });
    await prisma.user.update({
      where: { id: u.id },
      data: { kycSubmittedAt: new Date(), nationalId: "CM90012345ABCD", kycProvider: "none" },
    });
    return u;
  }

  it("queues submitted-but-unverified customers and excludes verified/rejected ones", async () => {
    const { token } = await createAdmin();
    const pending = await submitted("Pending Person");
    const verified = await submitted("Verified Person");
    await prisma.user.update({ where: { id: verified.id }, data: { kycVerified: true } });
    await createUser({ fullName: "Never Submitted" });

    const queue = await call("GET", "/api/admin/kyc?status=pending", token);
    expect(queue.body.total).toBe(1);
    expect(queue.body.items[0].id).toBe(pending.id);
    expect(queue.body.items[0].kycStatus).toBe("pending");

    const summary = await call("GET", "/api/admin/kyc/summary", token);
    expect(summary.body).toMatchObject({ pending: 1, approved: 1, rejected: 0, notSubmitted: 1 });
  });

  it("approve flips kyc_verified and the customer app sees 'verified'", async () => {
    const { token, id: adminId } = await createAdmin();
    const u = await submitted();

    const res = await call("POST", `/api/admin/kyc/${u.id}/approve`, token, { notes: "Documents legible" });
    expect(res.status).toBe(200);
    expect(res.body.kyc.kycStatus).toBe("verified");

    const customerView = await call("GET", "/api/kyc/status", tokenFor(u.id, "user"));
    expect(customerView.body.kyc.status).toBe("verified");

    const auditRow = await prisma.auditEvent.findFirst({ where: { action: "kyc.approved", entityId: u.id } });
    expect(auditRow?.actorId).toBe(adminId);
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(1);

    // Idempotence guard
    expect((await call("POST", `/api/admin/kyc/${u.id}/approve`, token, {})).status).toBe(409);
  });

  it("reject requires a reason, records it, and the customer app sees 'rejected' with the reason", async () => {
    const { token } = await createAdmin();
    const u = await submitted();

    expect((await call("POST", `/api/admin/kyc/${u.id}/reject`, token, {})).status).toBe(400);
    const res = await call("POST", `/api/admin/kyc/${u.id}/reject`, token, { notes: "ID photo unreadable" });
    expect(res.status).toBe(200);
    expect(res.body.kyc.kycStatus).toBe("rejected");

    const customerView = await call("GET", "/api/kyc/status", tokenFor(u.id, "user"));
    expect(customerView.body.kyc.status).toBe("rejected");
    expect(customerView.body.kyc.reviewNotes).toBe("ID photo unreadable");

    const queue = await call("GET", "/api/admin/kyc?status=rejected", token);
    expect(queue.body.total).toBe(1);
    expect((await call("GET", "/api/admin/kyc?status=pending", token)).body.total).toBe(0);
  });

  it("refuses to review a customer who has not submitted", async () => {
    const { token } = await createAdmin();
    const u = await createUser();
    expect((await call("POST", `/api/admin/kyc/${u.id}/approve`, token, {})).status).toBe(409);
  });

  it("documents endpoint reports missing files honestly and audits the view", async () => {
    const { token } = await createAdmin();
    const u = await submitted();
    await prisma.user.update({ where: { id: u.id }, data: { kycDocFrontRef: `${u.id}/front-missing.jpg`, kycDocBackRef: null } });

    const res = await call("GET", `/api/admin/kyc/${u.id}/documents`, token);
    expect(res.status).toBe(200);
    expect(res.body.front).toBeNull();
    expect(res.body.missing.front).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "kyc.documents_viewed", entityId: u.id } })).toBe(1);
  });
});

describe("admin ledger", () => {
  it("lists transactions with filters and totals, and exposes no write routes", async () => {
    const { token } = await createAdmin();
    const u = await createUser();
    await prisma.transaction.createMany({
      data: [
        { userId: u.id, type: "savings_deposit", amount: 10_000n, status: "completed" },
        { userId: u.id, type: "loan_disbursement", amount: 500_000n, status: "pending", loanId: "L1", reference: "LOAN-1" },
        { userId: u.id, type: "loan_payment", amount: 50_000n, status: "failed", loanId: "L1", reference: "REPAY-1", failureReason: "insufficient funds" },
      ],
    });

    const all = await call("GET", "/api/admin/transactions", token);
    expect(all.body.total).toBe(3);
    expect(all.body.totals.completed.amount).toBe(10_000);

    const attention = await call("GET", "/api/admin/transactions?status=attention", token);
    expect(attention.body.total).toBe(2);

    const byRef = await call("GET", "/api/admin/transactions?q=REPAY-1", token);
    expect(byRef.body.total).toBe(1);
    const detail = await call("GET", `/api/admin/transactions/${byRef.body.items[0].id}`, token);
    expect(detail.status).toBe(200);
    expect(detail.body.transaction.failureReason).toBe("insufficient funds");
    expect(detail.body.customer.id).toBe(u.id);

    // The ledger is append-only from the admin's point of view.
    const id = byRef.body.items[0].id;
    expect((await call("DELETE", `/api/admin/transactions/${id}`, token)).status).toBe(404);
    expect((await call("PATCH", `/api/admin/transactions/${id}`, token, { status: "completed" })).status).toBe(404);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).status).toBe("failed");
  });

  it("savings accounts report account balance next to the ledger-derived balance", async () => {
    const { token } = await createAdmin();
    const u = await createUser({ fullName: "Saver" });
    await prisma.savingsAccount.update({ where: { userId: u.id }, data: { balance: 30_000 } });
    await prisma.transaction.createMany({
      data: [
        { userId: u.id, type: "savings_deposit", amount: 50_000n, status: "completed" },
        { userId: u.id, type: "savings_withdrawal", amount: 20_000n, status: "completed" },
      ],
    });

    const res = await call("GET", "/api/admin/savings/accounts", token);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ balance: 30_000, ledgerBalance: 30_000, reconciled: true });
    expect(res.body.totalBalance).toBe(30_000);

    const tx = await call("GET", "/api/admin/savings/transactions", token);
    expect(tx.body.total).toBe(2);
    expect(tx.body.totals.savings_deposit).toBe(50_000);
  });
});

describe("admin support tickets", () => {
  it("starts empty, then supports create → reply → assign → resolve → close → reopen", async () => {
    const { token, id: adminId } = await createAdmin();
    const customer = await createUser({ fullName: "Ticket Customer" });

    expect((await call("GET", "/api/admin/tickets", token)).body.items).toEqual([]);

    const bad = await call("POST", "/api/admin/tickets", token, { customerId: customer.id, subject: "x" });
    expect(bad.status).toBe(400);

    const created = await call("POST", "/api/admin/tickets", token, {
      customerId: customer.id, subject: "Repayment not reflected", category: "repayments", priority: "high", body: "Customer called about a MoMo payment.",
    });
    expect(created.status).toBe(201);
    const id = created.body.ticket.id;
    expect(created.body.ticket.status).toBe("open");
    expect(created.body.ticket.customer.fullName).toBe("Ticket Customer");

    const reply = await call("POST", `/api/admin/tickets/${id}/messages`, token, { body: "We are checking with the provider." });
    expect(reply.status).toBe(201);
    expect(reply.body.ticket.status).toBe("pending");

    const assign = await call("PATCH", `/api/admin/tickets/${id}`, token, { assigneeId: adminId });
    expect(assign.status).toBe(200);
    expect(assign.body.ticket.assignee.id).toBe(adminId);

    const notStaff = await call("PATCH", `/api/admin/tickets/${id}`, token, { assigneeId: customer.id });
    expect(notStaff.status).toBe(400);

    const resolved = await call("PATCH", `/api/admin/tickets/${id}`, token, { status: "resolved" });
    expect(resolved.body.ticket.resolvedAt).toBeTruthy();

    const closed = await call("PATCH", `/api/admin/tickets/${id}`, token, { status: "closed" });
    expect(closed.body.ticket.status).toBe("closed");
    expect((await call("POST", `/api/admin/tickets/${id}/messages`, token, { body: "late" })).status).toBe(409);

    const reopened = await call("PATCH", `/api/admin/tickets/${id}`, token, { status: "open" });
    expect(reopened.body.ticket.closedAt).toBeNull();

    const detail = await call("GET", `/api/admin/tickets/${id}`, token);
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.history.map((h: any) => h.action)).toEqual(
      expect.arrayContaining(["ticket.created", "ticket.updated", "ticket.resolved", "ticket.closed", "ticket.open"])
    );

    const summary = await call("GET", "/api/admin/tickets/summary", token);
    expect(summary.body.counts.open).toBe(1);

    const stats = await call("GET", "/api/admin/stats", token);
    expect(stats.body.openTickets).toBe(1);
  });

  it("filters by status and search, and 404s unknown tickets", async () => {
    const { token } = await createAdmin();
    const c = await createUser({ fullName: "Search Target" });
    await call("POST", "/api/admin/tickets", token, { customerId: c.id, subject: "Login problem", category: "account" });
    const t2 = await call("POST", "/api/admin/tickets", token, { customerId: c.id, subject: "Savings question", category: "savings" });
    await call("PATCH", `/api/admin/tickets/${t2.body.ticket.id}`, token, { status: "closed" });

    expect((await call("GET", "/api/admin/tickets", token)).body.total).toBe(1);
    expect((await call("GET", "/api/admin/tickets?status=all", token)).body.total).toBe(2);
    expect((await call("GET", "/api/admin/tickets?status=closed", token)).body.total).toBe(1);
    expect((await call("GET", "/api/admin/tickets?q=login", token)).body.total).toBe(1);
    expect((await call("GET", "/api/admin/tickets/00000000-0000-0000-0000-000000000009", token)).status).toBe(404);
  });
});

describe("admin staff", () => {
  it("creates staff, lists them, and blocks self/last-admin deactivation", async () => {
    const { token, id: adminId } = await createAdmin();

    expect((await call("POST", "/api/admin/staff", token, { fullName: "New", email: "bad", password: "0123456789" })).status).toBe(400);
    expect((await call("POST", "/api/admin/staff", token, { fullName: "New", email: "n@kuula.test", password: "short" })).status).toBe(400);

    const created = await call("POST", "/api/admin/staff", token, { fullName: "Second Staff", email: "Second@Kuula.test", password: "correct-horse-battery" });
    expect(created.status).toBe(201);
    expect(created.body.staff.role).toBe("admin");
    const secondId = created.body.staff.id;

    const dup = await call("POST", "/api/admin/staff", token, { fullName: "Dup", email: "second@kuula.test", password: "correct-horse-battery" });
    expect(dup.status).toBe(409);

    const list = await call("GET", "/api/admin/staff", token);
    expect(list.body.staff).toHaveLength(2);
    expect(list.body.staff.find((s: any) => s.id === adminId).isSelf).toBe(true);

    expect((await call("POST", `/api/admin/staff/${adminId}/deactivate`, token, {})).status).toBe(400);

    const off = await call("POST", `/api/admin/staff/${secondId}/deactivate`, token, { reason: "Left the company" });
    expect(off.status).toBe(200);
    expect(off.body.staff.active).toBe(false);

    // Deactivate the original admin from the second account, leaving exactly
    // one active admin — who must then be protected by the last-admin guard.
    const on = await call("POST", `/api/admin/staff/${secondId}/reactivate`, token, {});
    expect(on.status).toBe(200);
    const secondToken = tokenFor(secondId, "admin");
    expect((await call("POST", `/api/admin/staff/${adminId}/deactivate`, secondToken, { reason: "rotation" })).status).toBe(200);
    expect((await call("POST", `/api/admin/staff/${secondId}/deactivate`, secondToken, {})).status).toBe(400); // self
    expect(await prisma.user.count({ where: { role: "admin", deletedAt: null } })).toBe(1);
    // Even a still-valid token for a deactivated admin cannot remove the last one.
    expect((await call("POST", `/api/admin/staff/${secondId}/deactivate`, token, {})).status).toBe(409);
  });

  it("a customer can never be promoted through the staff API", async () => {
    const { token } = await createAdmin();
    const customer = await createUser();
    expect((await call("PATCH", `/api/admin/staff/${customer.id}`, token, { fullName: "Hacker" })).status).toBe(404);
    expect((await call("POST", `/api/admin/staff/${customer.id}/reactivate`, token, {})).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).role).toBe("user");
  });
});

describe("admin reports and config", () => {
  it("report defaults to this month, honours presets and custom ranges, and uses only stored rows", async () => {
    const { token } = await createAdmin();
    const u = await createUser();
    await prisma.transaction.create({ data: { userId: u.id, type: "loan_disbursement", amount: 200_000n, status: "completed", loanId: "L9" } });
    await prisma.transaction.create({
      data: { userId: u.id, type: "loan_disbursement", amount: 999_000n, status: "completed", loanId: "L8", createdAt: new Date("2020-01-15T00:00:00Z") },
    });

    const def = await call("GET", "/api/admin/report", token);
    expect(def.status).toBe(200);
    expect(def.body.period.preset).toBe("month");
    expect(def.body.revenue.totalDisbursed).toBe(200_000);

    const all = await call("GET", "/api/admin/report?range=all", token);
    expect(all.body.revenue.totalDisbursed).toBe(1_199_000);

    const custom = await call("GET", "/api/admin/report?from=2020-01-01&to=2020-01-31", token);
    expect(custom.body.period.preset).toBe("custom");
    expect(custom.body.revenue.totalDisbursed).toBe(999_000);

    expect((await call("GET", "/api/admin/report?from=garbage", token)).status).toBe(400);
    expect(def.body.monthly).toHaveLength(12);
    expect(def.body.daily).toHaveLength(7);
  });

  it("config reports real provider state instead of placeholders", async () => {
    const { token } = await createAdmin();
    const res = await call("GET", "/api/admin/config", token);
    expect(res.status).toBe(200);
    expect(res.body.providers.payments.configured).toBe(true);
    expect(res.body.providers.sms.configured).toBe(false); // test env uses the log driver
    expect(res.body.pricing.maxAprPercent).toBe(33.6);
  });

  it("audit log is readable and filterable", async () => {
    const { token } = await createAdmin();
    const c = await createUser();
    await call("PATCH", `/api/admin/customers/${c.id}`, token, { fullName: "Renamed Person" });

    const res = await call("GET", "/api/admin/audit?action=customer.", token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].actorName).toBe("Staff One");
  });
});
