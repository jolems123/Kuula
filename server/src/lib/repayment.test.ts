/**
 * C-02 (real repayment collection).
 *
 * Real PostgreSQL; only the provider's HTTP boundary is stubbed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  prisma,
  resetDatabase,
  createUser,
  createActiveLoanWithRepayment,
  stubProvider,
  type ProviderStub,
} from "../test/helpers.js";
import { requestCollection, settleRepayment } from "./repayment.js";
import { AppError } from "../middleware/error-handler.js";

let provider: ProviderStub;

beforeEach(async () => {
  await resetDatabase();
  provider = stubProvider();
});

afterEach(() => provider.restore());

describe("collection request", () => {
  it("sends a request-to-pay and leaves the balance untouched", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    const result = await requestCollection({ userId: user.id });

    expect(result.status).toBe("pending");
    expect(result.isPending).toBe(true);
    expect(provider.calls[0].url).toContain("/collections");

    // The heart of C-02: asking for money does not reduce the debt.
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
    expect(after.status).toBe("scheduled");

    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });
    expect(txn.status).toBe("pending");
  });

  it("never deducts from a wallet balance", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);

    await requestCollection({ userId: user.id });

    expect(await prisma.wallet.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("caps a client-supplied amount at the outstanding balance", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    const result = await requestCollection({ userId: user.id, requestedAmount: 99_000_000 });

    // Overpayment is impossible by construction: the client value is a cap.
    expect(result.amount).toBe(600_000);
    expect(provider.calls[0].body.amount).toBe(600_000);
  });

  it("supports a partial payment", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    const result = await requestCollection({ userId: user.id, requestedAmount: 200_000 });

    expect(result.amount).toBe(200_000);
    expect(provider.calls[0].body.amount).toBe(200_000);
  });

  it("rejects a non-positive amount", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);

    await expect(requestCollection({ userId: user.id, requestedAmount: 0 })).rejects.toThrow(AppError);
    await expect(requestCollection({ userId: user.id, requestedAmount: -5000 })).rejects.toThrow(AppError);
    expect(provider.calls).toHaveLength(0);
  });

  it("returns 'none' when the borrower has no outstanding loan", async () => {
    const user = await createUser();
    const result = await requestCollection({ userId: user.id });

    expect(result.status).toBe("none");
    expect(result.reason).toBe("no-active-loan");
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses a second prompt while one is already in flight", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);

    await requestCollection({ userId: user.id });
    await expect(requestCollection({ userId: user.id })).rejects.toThrow(/already/i);

    expect(provider.calls).toHaveLength(1);
  });

  it("concurrent taps send exactly one prompt", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => requestCollection({ userId: user.id }))
    );
    const sent = results.filter((r) => r.status === "fulfilled" && r.value.isPending);

    expect(sent).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { type: "loan_payment" } })).toBe(1);
  });

  it("leaves the row pending when the provider times out", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);
    provider.mode = "timeout";

    const result = await requestCollection({ userId: user.id });

    expect(result.needsReconciliation).toBe(true);
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });
    expect(txn.status).toBe("pending");
  });

  it("marks the attempt failed when the provider rejects the request", async () => {
    const user = await createUser();
    await createActiveLoanWithRepayment(user.id);
    provider.mode = "reject";

    const result = await requestCollection({ userId: user.id });

    expect(result.status).toBe("failed");
    expect(result.isPending).toBe(false);
    const txn = await prisma.transaction.findFirstOrThrow({ where: { type: "loan_payment" } });
    expect(txn.status).toBe("failed");
  });
});

describe("repayment settlement", () => {
  it("applies a full repayment and completes the loan", async () => {
    const user = await createUser();
    const { app, repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id });
    const txn = await pendingPayment();

    const outcome = await settleRepayment({ transactionId: txn.id, success: true });

    expect(outcome.applied).toBe(true);
    expect(outcome.fullyPaid).toBe(true);

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(600_000);
    expect(after.status).toBe("paid");
    expect(after.receiptId).toBeTruthy();

    const loan = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(loan.status).toBe("paid");
  });

  it("applies a partial repayment and leaves the loan open", async () => {
    const user = await createUser();
    const { app, repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await pendingPayment();

    const outcome = await settleRepayment({ transactionId: txn.id, success: true });

    expect(outcome.fullyPaid).toBe(false);
    expect(outcome.outstanding).toBe(400_000);

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
    expect(after.status).toBe("scheduled");

    const loan = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(loan.status).toBe("active");
  });

  it("sums two partial repayments correctly to completion", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    await requestCollection({ userId: user.id, requestedAmount: 250_000 });
    await settleRepayment({ transactionId: (await pendingPayment()).id, success: true });

    await requestCollection({ userId: user.id, requestedAmount: 350_000 });
    await settleRepayment({ transactionId: (await pendingPayment()).id, success: true });

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(600_000);
    expect(after.status).toBe("paid");
  });

  it("a duplicate callback is not applied twice", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await pendingPayment();

    await settleRepayment({ transactionId: txn.id, success: true });
    const duplicate = await settleRepayment({ transactionId: txn.id, success: true });

    expect(duplicate.applied).toBe(false);
    expect(duplicate.reason).toBe("already-completed");

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
  });

  it("concurrent callbacks apply the payment exactly once", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await pendingPayment();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => settleRepayment({ transactionId: txn.id, success: true }))
    );
    const applied = results.filter((r) => r.status === "fulfilled" && r.value.applied);

    expect(applied).toHaveLength(1);
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(200_000);
  });

  it("rejects a callback claiming a different amount", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id, requestedAmount: 200_000 });
    const txn = await pendingPayment();

    const outcome = await settleRepayment({ transactionId: txn.id, success: true, providerAmount: 1 });

    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toBe("amount-mismatch");
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
  });

  it("a failed callback leaves the balance unchanged", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await requestCollection({ userId: user.id });
    const txn = await pendingPayment();

    await settleRepayment({ transactionId: txn.id, success: false, reason: "customer declined" });

    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    expect(Number(after.amountPaid)).toBe(0);
    expect(after.status).toBe("scheduled");
  });

  it("caps an overpayment at the outstanding balance and flags the excess", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    // A stale prompt for the full amount is approved after a partial already landed.
    await requestCollection({ userId: user.id });
    const stale = await pendingPayment();
    await prisma.repayment.update({ where: { id: repayment.id }, data: { amountPaid: BigInt(500_000) } });

    const outcome = await settleRepayment({ transactionId: stale.id, success: true });

    expect(outcome.allocated).toBe(100_000);
    const after = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    // amount_paid never exceeds total — also guarded by a CHECK constraint.
    expect(Number(after.amountPaid)).toBe(600_000);

    const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: stale.id } });
    expect(txn.failureReason).toMatch(/overpayment/);
  });

  it("refuses a collection against an already-completed loan", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });
    await prisma.repayment.update({
      where: { id: repayment.id },
      data: { amountPaid: BigInt(600_000), status: "paid" },
    });

    const result = await requestCollection({ userId: user.id });

    expect(result.status).toBe("none");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("financial invariants", () => {
  it("the database forbids amount_paid exceeding total", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id, { total: 600_000 });

    await expect(
      prisma.repayment.update({ where: { id: repayment.id }, data: { amountPaid: BigInt(600_001) } })
    ).rejects.toThrow();
  });

  it("the database forbids a negative amount_paid", async () => {
    const user = await createUser();
    const { repayment } = await createActiveLoanWithRepayment(user.id);

    await expect(
      prisma.repayment.update({ where: { id: repayment.id }, data: { amountPaid: BigInt(-1) } })
    ).rejects.toThrow();
  });

  it("the database forbids a negative wallet balance", async () => {
    const user = await createUser();
    await prisma.wallet.create({ data: { userId: user.id, balance: BigInt(0) } });

    await expect(
      prisma.wallet.update({ where: { userId: user.id }, data: { balance: BigInt(-1) } })
    ).rejects.toThrow();
  });

  it("the database forbids a negative savings balance", async () => {
    const user = await createUser();

    await expect(
      prisma.savingsAccount.update({ where: { userId: user.id }, data: { balance: BigInt(-1) } })
    ).rejects.toThrow();
  });

  it("a borrower cannot collect against another borrower's loan", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    await createActiveLoanWithRepayment(owner.id, { total: 600_000 });

    const result = await requestCollection({ userId: attacker.id });

    expect(result.status).toBe("none");
    expect(provider.calls).toHaveLength(0);
  });
});

async function pendingPayment() {
  return prisma.transaction.findFirstOrThrow({ where: { status: "pending", type: "loan_payment" } });
}
