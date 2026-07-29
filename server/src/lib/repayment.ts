/**
 * Real repayment collection (C-02).
 *
 * Replaces the simulated `wallet.balance -= amount` deduction with a MarzPay
 * request-to-pay against the borrower's mobile money.
 *
 * The invariant this file exists to enforce:
 *
 *     A loan balance is NEVER reduced because a client said a payment
 *     succeeded. It is reduced only when the provider confirms the
 *     collection, and that confirmation is applied exactly once.
 *
 * `requestCollection` can only ever create a `pending` ledger row.
 * `settleRepayment` — reachable only from the verified webhook and the
 * reconciliation sweep — is the sole writer of `repayments.amount_paid`.
 */
import type { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import { audit } from "./audit.js";
import { lockRepayment, lockTransaction, isUniqueViolation, LockContendedError } from "./db-lock.js";
import * as marzpay from "./marzpay.js";
import { PaymentProviderError } from "./marzpay.js";
import { config } from "./config.js";

export interface CollectionResult {
  status: "pending" | "failed" | "none";
  /** The frontend advances to "approve on your phone" only on this flag. */
  isPending: boolean;
  amount: number;
  reference: string | null;
  providerRef: string | null;
  transactionId: string | null;
  outstanding: number;
  reason: string;
  message: string;
  needsReconciliation?: boolean;
}

/**
 * Borrower initiates a repayment.
 *
 * @param requestedAmount Optional. Treated as a CAP, never as an instruction:
 *   the payable amount is computed server-side from the loan and the client
 *   value can only reduce it. Overpayment is impossible by construction.
 */
export async function requestCollection(args: {
  userId: string;
  requestedAmount?: number | null;
  idempotencyKey?: string;
}): Promise<CollectionResult> {
  const { userId } = args;

  if (args.idempotencyKey) {
    const existing = await prisma.transaction.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing) {
      return {
        status: existing.status === "failed" ? "failed" : "pending",
        isPending: existing.status === "pending",
        amount: Number(existing.amount),
        reference: existing.reference,
        providerRef: existing.providerRef,
        transactionId: existing.id,
        outstanding: 0,
        reason: "duplicate-request",
        message: "This payment has already been requested.",
      };
    }
  }

  if (!marzpay.paymentsConfigured()) {
    throw new AppError("Payments are temporarily unavailable. Please try again shortly.", 503);
  }

  // Find the borrower's active debt outside the lock, then re-read it under the
  // lock so the decision is made on committed state.
  const candidate = await prisma.repayment.findFirst({
    where: { userId, status: { not: "paid" } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) {
    return noneResult("no-active-loan", "You have no outstanding repayment.");
  }

  let claim: {
    txnId: string;
    reference: string;
    amount: number;
    phone: string;
    loanId: string;
    outstanding: number;
  };

  try {
    claim = await prisma.$transaction(async (tx) => {
      const found = await lockRepayment(tx, candidate.id);
      if (!found) throw new AppError("Repayment not found", 404);

      const rep = await tx.repayment.findUniqueOrThrow({ where: { id: candidate.id } });

      // Borrower isolation: never collect against another user's loan.
      if (rep.userId !== userId) throw new AppError("Repayment not found", 404);

      if (rep.status === "paid") {
        throw new AppError("This loan is already fully repaid.", 409);
      }

      const outstanding = Number(rep.total) - Number(rep.amountPaid);
      if (outstanding <= 0) {
        throw new AppError("This loan is already fully repaid.", 409);
      }

      // Server-authoritative amount. A client asking for more than is owed is
      // silently capped; a client asking for a non-positive amount is rejected.
      const requested = args.requestedAmount;
      let amount = outstanding;
      if (requested != null) {
        const rounded = Math.round(Number(requested));
        if (!Number.isFinite(rounded) || rounded <= 0) {
          throw new AppError("Enter a payment amount greater than zero.", 400);
        }
        amount = Math.min(rounded, outstanding);
      }

      const inFlight = await tx.transaction.findFirst({
        where: { loanId: rep.loanId, type: "loan_payment", status: "pending" },
      });
      if (inFlight) {
        // A collection prompt is already sitting on the borrower's handset.
        // Sending a second one risks charging twice for the same debt.
        throw new AppError(
          "A payment request is already waiting for approval on your phone. Complete or cancel it first.",
          409
        );
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const phone = user.phone ?? "";
      if (!marzpay.isValidUgandaMobile(phone)) {
        throw new AppError("Add a valid Ugandan mobile money number to your profile before paying.", 422);
      }

      const attemptNo = await tx.transaction.count({
        where: { loanId: rep.loanId, type: "loan_payment" },
      });
      const reference = `REPAY-${rep.id}-${attemptNo + 1}`;

      const txn = await tx.transaction.create({
        data: {
          userId,
          loanId: rep.loanId,
          repaymentId: rep.id,
          type: "loan_payment",
          amount: BigInt(Math.round(amount)),
          status: "pending",
          provider: "marzpay",
          reference,
          idempotencyKey: args.idempotencyKey?.trim() || reference,
        },
      });

      await audit(
        {
          actorId: userId,
          actorRole: "user",
          action: "loan.repayment.requested",
          entityType: "repayment",
          entityId: rep.id,
          metadata: { amount, outstanding, reference, transactionId: txn.id },
        },
        tx
      );

      return { txnId: txn.id, reference, amount, phone, loanId: rep.loanId, outstanding };
    });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("A payment for this loan is already being processed.", 409);
    }
    if (isUniqueViolation(err, "idempotency_key") || isUniqueViolation(err, "one_pending_collection")) {
      throw new AppError("A payment request for this loan is already in progress.", 409);
    }
    throw err;
  }

  // ── Provider call, outside the DB transaction ────────────────────────────
  let result: marzpay.MarzResult;
  try {
    result = await marzpay.collect({
      phone: claim.phone,
      amount: claim.amount,
      reference: claim.reference,
      description: `Kuula repayment ${claim.loanId}`,
      callbackUrl: marzpay.callbackUrl(),
    });
  } catch (err) {
    if (err instanceof PaymentProviderError && err.retryable) {
      // Ambiguous: the prompt may have gone out. Leave the row pending so the
      // webhook/reconciliation decides. Do NOT send a second prompt.
      await prisma.transaction.update({
        where: { id: claim.txnId },
        data: { failureReason: `provider-unreachable: ${err.message}` },
      });
      return {
        status: "pending",
        isPending: true,
        amount: claim.amount,
        reference: claim.reference,
        providerRef: null,
        transactionId: claim.txnId,
        outstanding: claim.outstanding,
        reason: "provider-timeout",
        needsReconciliation: true,
        message:
          "We submitted your payment but have not yet confirmed it. Check your phone for a prompt — " +
          "we will update your balance once it settles.",
      };
    }
    await failCollection(claim.txnId, `provider-error: ${(err as Error).message}`);
    throw new AppError("We could not reach the payment provider. Please try again shortly.", 502);
  }

  if (!result.ok) {
    await failCollection(claim.txnId, result.message);
    return {
      status: "failed",
      isPending: false,
      amount: claim.amount,
      reference: claim.reference,
      providerRef: result.uuid || null,
      transactionId: claim.txnId,
      outstanding: claim.outstanding,
      reason: "request-rejected",
      message: `The payment request was rejected: ${result.message}`,
    };
  }

  await prisma.transaction.update({
    where: { id: claim.txnId },
    data: { providerRef: result.uuid || claim.reference, transactionId: result.uuid || claim.reference },
  });
  await appendAttempt(claim.txnId, {
    at: new Date().toISOString(),
    method: "momo-collection",
    amount: claim.amount,
    success: false,
    reason: "pending-customer-approval",
    provider_uuid: result.uuid,
    reference: claim.reference,
  });

  return {
    status: "pending",
    isPending: true,
    amount: claim.amount,
    reference: claim.reference,
    providerRef: result.uuid || null,
    transactionId: claim.txnId,
    outstanding: claim.outstanding,
    reason: "pending-customer-approval",
    message: "Approve the payment prompt on your phone to complete the repayment.",
  };
}

function noneResult(reason: string, message: string): CollectionResult {
  return {
    status: "none",
    isPending: false,
    amount: 0,
    reference: null,
    providerRef: null,
    transactionId: null,
    outstanding: 0,
    reason,
    message,
  };
}

async function failCollection(txnId: string, reason: string): Promise<void> {
  await prisma.transaction.updateMany({
    where: { id: txnId, status: "pending" },
    data: { status: "failed", failureReason: reason.slice(0, 500), settledAt: new Date() },
  });
}

async function appendAttempt(txnId: string, attempt: Record<string, unknown>): Promise<void> {
  const txn = await prisma.transaction.findUnique({ where: { id: txnId } });
  if (!txn?.repaymentId) return;
  await prisma.$transaction(async (tx) => {
    await lockRepayment(tx, txn.repaymentId!);
    const rep = await tx.repayment.findUnique({ where: { id: txn.repaymentId! } });
    if (!rep) return;
    const attempts = Array.isArray(rep.attempts) ? (rep.attempts as unknown[]) : [];
    await tx.repayment.update({
      where: { id: rep.id },
      data: { attempts: [...attempts, attempt] as unknown as Prisma.InputJsonValue },
    });
  });
}

// ── Settlement (called only from the verified webhook) ──────────────────────

export interface RepaymentSettlement {
  applied: boolean;
  reason: string;
  allocated?: number;
  amountPaid?: number;
  outstanding?: number;
  fullyPaid?: boolean;
  receiptId?: string | null;
}

/**
 * Apply a confirmed collection outcome. Exactly once.
 *
 * Every duplicate, replayed and concurrent callback funnels through the same
 * compare-and-set on `transactions.status`, under a row lock, so at most one of
 * them ever touches `amount_paid`.
 */
export async function settleRepayment(args: {
  transactionId: string;
  success: boolean;
  providerRef?: string | null;
  providerAmount?: number | null;
  reason?: string;
}): Promise<RepaymentSettlement> {
  return prisma.$transaction(async (tx) => {
    const found = await lockTransaction(tx, args.transactionId);
    if (!found) return { applied: false, reason: "transaction-not-found" };

    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: args.transactionId } });

    if (txn.status !== "pending") return { applied: false, reason: `already-${txn.status}` };
    if (txn.type !== "loan_payment") return { applied: false, reason: "wrong-transaction-type" };

    const ledgerAmount = Number(txn.amount);
    if (args.providerAmount != null && Math.round(args.providerAmount) !== ledgerAmount) {
      await tx.transaction.update({
        where: { id: txn.id },
        data: { failureReason: `amount-mismatch: expected ${ledgerAmount}, provider reported ${args.providerAmount}` },
      });
      await audit(
        {
          action: "loan.repayment.amount_mismatch",
          entityType: "transaction",
          entityId: txn.id,
          metadata: { expected: ledgerAmount, reported: args.providerAmount },
        },
        tx
      );
      return { applied: false, reason: "amount-mismatch" };
    }

    const now = new Date();

    if (!args.success) {
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          status: "failed",
          settledAt: now,
          failureReason: (args.reason ?? "provider reported failure").slice(0, 500),
          providerRef: args.providerRef || txn.providerRef,
        },
      });
      if (txn.repaymentId) {
        await lockRepayment(tx, txn.repaymentId);
        const rep = await tx.repayment.findUnique({ where: { id: txn.repaymentId } });
        if (rep) {
          const attempts = Array.isArray(rep.attempts) ? (rep.attempts as unknown[]) : [];
          await tx.repayment.update({
            where: { id: rep.id },
            data: {
              attempts: [
                ...attempts,
                {
                  at: now.toISOString(),
                  method: "momo-collection",
                  amount: ledgerAmount,
                  success: false,
                  reason: "declined-or-failed",
                  provider_uuid: args.providerRef ?? txn.providerRef,
                },
              ] as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
      await tx.notification.create({
        data: {
          userId: txn.userId,
          title: "Payment failed",
          body: "Your repayment was not completed. Your balance is unchanged — please try again.",
          type: "warning",
        },
      });
      await audit(
        {
          action: "loan.repayment.settled_failed",
          entityType: "transaction",
          entityId: txn.id,
          metadata: { reason: args.reason },
        },
        tx
      );
      return { applied: true, reason: "failed" };
    }

    // ── Success: claim the row, then allocate. ──────────────────────────────
    await tx.transaction.update({
      where: { id: txn.id },
      data: { status: "completed", settledAt: now, providerRef: args.providerRef || txn.providerRef },
    });

    if (!txn.repaymentId) {
      return { applied: true, reason: "settled-without-repayment" };
    }

    await lockRepayment(tx, txn.repaymentId);
    const rep = await tx.repayment.findUnique({ where: { id: txn.repaymentId } });
    if (!rep) return { applied: true, reason: "settled-orphan-transaction" };

    const total = Number(rep.total);
    const paidBefore = Number(rep.amountPaid);
    const outstandingBefore = total - paidBefore;

    // Allocation is capped at what is actually owed. If the borrower somehow
    // paid more than the outstanding balance (a stale prompt approved after a
    // partial payment landed), the excess is recorded on the transaction as an
    // overpayment for refund rather than driving amount_paid past total.
    const allocated = Math.max(0, Math.min(ledgerAmount, outstandingBefore));
    const overpaid = ledgerAmount - allocated;
    const amountPaid = paidBefore + allocated;
    const fullyPaid = amountPaid >= total;
    const receiptId = `RCPT-${now.getTime()}-${txn.id.slice(0, 8)}`;

    const attempts = Array.isArray(rep.attempts) ? (rep.attempts as unknown[]) : [];
    await tx.repayment.update({
      where: { id: rep.id },
      data: {
        amountPaid: BigInt(amountPaid),
        status: fullyPaid ? "paid" : rep.status === "overdue" ? "overdue" : "scheduled",
        receiptId,
        attempts: [
          ...attempts,
          {
            at: now.toISOString(),
            method: "momo-collection",
            amount: allocated,
            success: true,
            reason: fullyPaid ? "collected" : "partial-payment-collected",
            provider_uuid: args.providerRef ?? txn.providerRef,
            receipt_id: receiptId,
            ...(overpaid > 0 ? { overpaid } : {}),
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    if (overpaid > 0) {
      await tx.transaction.update({
        where: { id: txn.id },
        data: { failureReason: `overpayment: ${overpaid} UGX collected beyond the outstanding balance — refund due` },
      });
      await audit(
        {
          action: "loan.repayment.overpayment",
          entityType: "repayment",
          entityId: rep.id,
          metadata: { collected: ledgerAmount, allocated, overpaid },
        },
        tx
      );
    }

    if (fullyPaid) {
      await tx.loanApplication.updateMany({
        where: { applicantId: rep.userId, loanId: rep.loanId, status: { in: ["active", "overdue", "disbursing"] } },
        data: { status: "paid" },
      });
      await tx.user.update({
        where: { id: rep.userId },
        data: { loansRepaid: { increment: 1 } },
      });
    }

    await tx.notification.create({
      data: {
        userId: rep.userId,
        title: fullyPaid ? "Loan fully repaid" : "Payment received",
        body: fullyPaid
          ? `Your loan is fully repaid. Receipt ${receiptId}.`
          : `We received UGX ${allocated.toLocaleString()}. UGX ${(total - amountPaid).toLocaleString()} remaining.`,
        type: "success",
      },
    });

    await audit(
      {
        action: fullyPaid ? "loan.repayment.completed" : "loan.repayment.partial",
        entityType: "repayment",
        entityId: rep.id,
        metadata: { transactionId: txn.id, allocated, amountPaid, total, receiptId, overpaid },
      },
      tx
    );

    return {
      applied: true,
      reason: fullyPaid ? "collected" : "partial-payment-collected",
      allocated,
      amountPaid,
      outstanding: total - amountPaid,
      fullyPaid,
      receiptId,
    };
  });
}

/**
 * Resolve collections whose outcome we never learned. Same exactly-once path as
 * the webhook, so a reconciliation racing a late callback is safe.
 */
export async function reconcilePendingCollections(olderThanMs = 10 * 60_000): Promise<number> {
  if (!marzpay.paymentsConfigured() || !config.marzpay.verifyCallbacks) return 0;

  const stale = await prisma.transaction.findMany({
    where: {
      type: "loan_payment",
      status: "pending",
      createdAt: { lt: new Date(Date.now() - olderThanMs) },
    },
    take: 50,
  });

  let settled = 0;
  for (const txn of stale) {
    const ref = txn.providerRef ?? txn.reference;
    if (!ref) continue;
    try {
      const status = await marzpay.fetchTransactionStatus(ref);
      if (!status.final) continue;
      const outcome = await settleRepayment({
        transactionId: txn.id,
        success: status.success,
        providerRef: txn.providerRef,
        providerAmount: status.amount,
        reason: `reconciliation: provider status ${status.status}`,
      });
      if (outcome.applied) settled += 1;
    } catch (err) {
      console.error("[reconcile] collection", txn.id, (err as Error).message);
    }
  }
  return settled;
}

/** Mark loans past their due date as overdue. Purely a state change, no money. */
export async function markOverdueRepayments(): Promise<number> {
  const now = new Date();
  const due = await prisma.repayment.findMany({
    where: { status: "scheduled", dueDate: { lt: now } },
    take: 200,
  });
  for (const rep of due) {
    await prisma.repayment.update({ where: { id: rep.id }, data: { status: "overdue" } });
    await prisma.loanApplication.updateMany({
      where: { applicantId: rep.userId, loanId: rep.loanId, status: "active" },
      data: { status: "overdue" },
    });
  }
  return due.length;
}
