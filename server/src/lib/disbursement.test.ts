/**
 * C-01 (real disbursement) and C-06 (approval/disbursement idempotency).
 *
 * These run against real PostgreSQL. The partial unique indexes and row locks
 * being verified do not exist in a mock, so a mocked test would prove nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  prisma,
  resetDatabase,
  createUser,
  createOfferedLoan,
  stubProvider,
  type ProviderStub,
} from "../test/helpers.js";
import { requestDisbursement, settleDisbursement } from "./disbursement.js";
import { AppError } from "../middleware/error-handler.js";

let provider: ProviderStub;

beforeEach(async () => {
  await resetDatabase();
  provider = stubProvider();
});

afterEach(() => provider.restore());

describe("disbursement request", () => {
  it("calls the provider and leaves the loan PENDING, not disbursed", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 500_000 });

    const result = await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    expect(result.status).toBe("pending");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].url).toContain("/disbursements");

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    // The core of C-01: acceptance must not make the loan active.
    expect(after.status).toBe("disbursing");
    expect(after.disbursedAt).toBeNull();

    const txn = await prisma.transaction.findFirstOrThrow({ where: { loanId: after.loanId! } });
    expect(txn.status).toBe("pending");
    expect(txn.providerRef).toBeTruthy();
  });

  it("sends the server-side principal, never a client-supplied amount", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 250_000 });

    await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    expect(provider.calls[0].body.amount).toBe(250_000);
  });

  it("never credits a wallet balance", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 500_000 });

    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    await settleDisbursement({ transactionId: (await pendingTxn()).id, success: true });

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet).toBeNull();
    void app;
  });

  it("refuses a borrower without a valid Ugandan mobile number", async () => {
    const user = await createUser({ phone: "+15551234567" });
    const app = await createOfferedLoan(user.id);

    await expect(requestDisbursement({ applicantId: user.id, applicationId: app.id })).rejects.toThrow(AppError);
    expect(provider.calls).toHaveLength(0);

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    // A bad number must not strand the offer in `disbursing`.
    expect(after.status).toBe("offered");
  });

  it("refuses to disburse another borrower's loan", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const app = await createOfferedLoan(owner.id);

    await expect(
      requestDisbursement({ applicantId: attacker.id, applicationId: app.id })
    ).rejects.toThrow(/not found/i);
    expect(provider.calls).toHaveLength(0);
  });

  it("releases the offer when the provider definitively rejects", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    provider.mode = "reject";

    const result = await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    expect(result.status).toBe("failed");
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("offered");
    expect(after.acceptedAt).toBeNull();

    const txn = await prisma.transaction.findFirstOrThrow({ where: { userId: user.id } });
    expect(txn.status).toBe("failed");
  });

  it("holds the lock and flags reconciliation when the provider times out", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    provider.mode = "timeout";

    const result = await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    // Ambiguous: the payout may have gone through. Releasing the lock and
    // letting the borrower retry could pay them twice.
    expect(result.status).toBe("pending");
    expect(result.needsReconciliation).toBe(true);

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("disbursing");

    const txn = await prisma.transaction.findFirstOrThrow({ where: { userId: user.id } });
    expect(txn.status).toBe("pending");
  });
});

describe("disbursement idempotency (C-06)", () => {
  it("a double-click produces exactly one payout", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);

    const first = await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const second = await requestDisbursement({ applicantId: user.id, applicationId: app.id });

    expect(first.status).toBe("pending");
    expect(second.status).toBe("already_requested");
    expect(provider.calls).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { type: "loan_disbursement" } })).toBe(1);
  });

  it("concurrent acceptances produce exactly one payout", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => requestDisbursement({ applicantId: user.id, applicationId: app.id }))
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof requestDisbursement>>> => r.status === "fulfilled"
    );
    const fresh = fulfilled.filter((r) => r.value.status === "pending");

    expect(fresh).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { type: "loan_disbursement" } })).toBe(1);
  });

  it("a client retry with the same idempotency key does not pay twice", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    const key = "client-retry-key-1";

    await requestDisbursement({ applicantId: user.id, applicationId: app.id, idempotencyKey: key });
    const retry = await requestDisbursement({ applicantId: user.id, applicationId: app.id, idempotencyKey: key });

    expect(retry.status).toBe("already_requested");
    expect(provider.calls).toHaveLength(1);
  });

  it("an already-disbursed loan cannot be disbursed again", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);

    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    await settleDisbursement({ transactionId: (await pendingTxn()).id, success: true });

    const again = await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    expect(again.status).toBe("already_disbursed");
    expect(provider.calls).toHaveLength(1);
  });

  it("the database rejects a second live disbursement row outright", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const loanId = (await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } })).loanId!;

    // Bypass every application-level guard: the constraint must still hold.
    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          loanId,
          type: "loan_disbursement",
          amount: BigInt(500_000),
          status: "pending",
          reference: "LOAN-forged",
        },
      })
    ).rejects.toThrow();
  });
});

describe("disbursement settlement", () => {
  it("marks the loan active and schedules repayment exactly once", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 500_000, total: 600_000 });
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await pendingTxn();

    const first = await settleDisbursement({ transactionId: txn.id, success: true });
    expect(first.applied).toBe(true);

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("active");
    expect(after.disbursedAt).not.toBeNull();
    expect(await prisma.repayment.count({ where: { userId: user.id } })).toBe(1);
  });

  it("a duplicate callback has no second financial effect", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await pendingTxn();

    await settleDisbursement({ transactionId: txn.id, success: true });
    const duplicate = await settleDisbursement({ transactionId: txn.id, success: true });

    expect(duplicate.applied).toBe(false);
    expect(duplicate.reason).toBe("already-completed");
    expect(await prisma.repayment.count({ where: { userId: user.id } })).toBe(1);
    void app;
  });

  it("concurrent callbacks settle exactly once", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await pendingTxn();

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => settleDisbursement({ transactionId: txn.id, success: true }))
    );
    const applied = results.filter((r) => r.status === "fulfilled" && r.value.applied);

    expect(applied).toHaveLength(1);
    expect(await prisma.repayment.count({ where: { userId: user.id } })).toBe(1);
    void app;
  });

  it("rejects a callback whose amount differs from the requested payout", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id, { amount: 500_000 });
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await pendingTxn();

    const outcome = await settleDisbursement({
      transactionId: txn.id,
      success: true,
      providerAmount: 5_000_000, // ten times what we asked for
    });

    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toBe("amount-mismatch");

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("disbursing");
    expect(after.disbursedAt).toBeNull();
  });

  it("a failed callback books nothing and reopens the offer", async () => {
    const user = await createUser();
    const app = await createOfferedLoan(user.id);
    await requestDisbursement({ applicantId: user.id, applicationId: app.id });
    const txn = await pendingTxn();

    await settleDisbursement({ transactionId: txn.id, success: false, reason: "customer wallet unreachable" });

    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("offered");
    expect(after.disbursedAt).toBeNull();
    expect(await prisma.repayment.count({ where: { userId: user.id } })).toBe(0);
  });
});

async function pendingTxn() {
  return prisma.transaction.findFirstOrThrow({ where: { status: "pending", type: "loan_disbursement" } });
}
