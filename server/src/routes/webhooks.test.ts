/**
 * C-08 (webhook security) — end-to-end through the real Express route.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import {
  prisma,
  resetDatabase,
  createUser,
  createOfferedLoan,
  createActiveLoanWithRepayment,
  stubProvider,
  signWebhook,
  type ProviderStub,
} from "../test/helpers.js";
import { requestDisbursement } from "../lib/disbursement.js";
import { requestCollection } from "../lib/repayment.js";
import webhookRoutes from "./webhooks.js";

let provider: ProviderStub;
let server: Server;
let baseUrl: string;
/** Captured before the provider stub replaces global fetch. */
let realFetch: typeof globalThis.fetch;

beforeEach(async () => {
  await resetDatabase();
  realFetch = globalThis.fetch;
  provider = stubProvider();

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );
  app.use("/api/webhooks", webhookRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  provider.restore();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** POST a callback, signed correctly unless told otherwise. */
async function postCallback(
  body: Record<string, unknown>,
  opts: { signature?: string; timestamp?: string; omitSignature?: boolean } = {}
) {
  const raw = JSON.stringify(body);
  const signed = signWebhook(raw, "test-webhook-secret", opts.timestamp);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.omitSignature) {
    headers["X-Marzpay-Signature"] = opts.signature ?? signed.signature;
    headers["X-Marzpay-Timestamp"] = opts.timestamp ?? signed.timestamp;
  }
  // The stub owns globalThis.fetch; use the captured real one to drive HTTP.
  const res = await realFetch(`${baseUrl}/api/webhooks/marzpay`, { method: "POST", headers, body: raw });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("authenticity", () => {
  it("rejects an unsigned callback", async () => {
    const res = await postCallback({ reference: "LOAN-x", status: "success" }, { omitSignature: true });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing-signature");
  });

  it("rejects a forged signature", async () => {
    const res = await postCallback({ reference: "LOAN-x", status: "success" }, { signature: "0".repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid-signature");
  });

  it("rejects a replayed callback outside the timestamp window", async () => {
    const oldTimestamp = String(Date.now() - 20 * 60 * 1000);
    const res = await postCallback({ reference: "LOAN-x", status: "success" }, { timestamp: oldTimestamp });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("stale-timestamp");
  });

  it("settles nothing for an unsigned callback even with a real reference", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    await postCallback({ reference: `LOAN-${app.id}`, status: "success" }, { omitSignature: true });

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("disbursing");
    expect(after.disbursedAt).toBeNull();
  });
});

describe("matching and validation", () => {
  it("ignores a callback for an unknown reference", async () => {
    const res = await postCallback({ reference: "LOAN-does-not-exist", status: "success" });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("no-matching-transaction");
  });

  it("rejects a malformed callback with no reference at all", async () => {
    const res = await postCallback({ hello: "world" });
    expect(res.status).toBe(400);
  });

  it("rejects a collection callback pointed at a disbursement row", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_disbursement" } });

    const res = await postCallback({
      reference: txn.reference,
      eventType: "collection.success",
      uuid: txn.providerRef,
    });

    expect(res.body.result).toMatch(/type-mismatch/);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("disbursing");
  });

  it("refuses to settle on an amount that differs from the ledger", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    const res = await postCallback({
      reference: txn.reference,
      status: "success",
      amount: 600_000,
      uuid: txn.providerRef,
    });

    expect(res.body.result).toBe("amount-mismatch");
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
  });
});

describe("exactly-once settlement", () => {
  it("settles a disbursement and marks the loan active", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 500_000, total: 600_000 });
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_disbursement" } });

    const res = await postCallback({ reference: txn.reference, status: "success", uuid: txn.providerRef });

    expect(res.status).toBe(200);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("active");
    expect(after.disbursedAt).not.toBeNull();
    expect(await prisma.repayment.count({ where: { userId: user.id } })).toBe(1);
  });

  it("settles a repayment and reduces the balance", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    await postCallback({ reference: txn.reference, status: "success", uuid: txn.providerRef });

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
  });

  it("treats a redelivered identical callback as a duplicate", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });
    const body = { reference: txn.reference, status: "success", uuid: txn.providerRef };

    await postCallback(body);
    const second = await postCallback(body);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
    expect(await prisma.webhookEvent.count()).toBe(1);
  });

  it("applies a distinct late callback for a settled transaction only once", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    await postCallback({ reference: txn.reference, status: "success", uuid: txn.providerRef });
    // Same money, different event id — must still not re-apply.
    const late = await postCallback({
      reference: txn.reference,
      status: "successful",
      uuid: txn.providerRef,
      eventId: "distinct-late-event",
    });

    expect(late.body.result).toBe("already-completed");
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
  });

  it("applies exactly once when duplicate callbacks arrive concurrently", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        postCallback({ reference: txn.reference, status: "success", uuid: txn.providerRef, eventId: `evt-${i}` })
      )
    );

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
    expect(await prisma.transaction.count({ where: { type: "loan_payment", status: "completed" } })).toBe(1);
  });

  it("a failure callback produces no financial effect", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    await postCallback({ reference: txn.reference, status: "failed", uuid: txn.providerRef });

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
    const settled = await prisma.transaction.findUniqueOrThrow({ where: { id: txn.id } });
    expect(settled.status).toBe("failed");
  });

  it("ignores an event whose outcome is indeterminate", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });

    const res = await postCallback({ reference: txn.reference, status: "received", uuid: txn.providerRef });

    expect(res.body.result).toMatch(/indeterminate/);
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
  });
});
