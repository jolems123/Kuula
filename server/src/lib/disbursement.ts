/**
 * Real loan disbursement (C-01).
 *
 * Replaces the simulated `wallet.balance += principal` credit with a
 * provider-backed payout to the borrower's own mobile-money account.
 *
 * The invariant this file exists to enforce:
 *
 *     A loan is NEVER marked disbursed because we asked for a payout.
 *     It is marked disbursed only when the provider confirms the payout,
 *     and that confirmation is applied exactly once.
 *
 * Two phases:
 *
 *   1. `requestDisbursement` — under a row lock, claims the payout slot
 *      (offered -> disbursing, accepted_at NULL -> now), writes a `pending`
 *      ledger row, and only then calls MarzPay. The unique index
 *      `transactions_one_live_disbursement_per_loan` means a second concurrent
 *      claim cannot even reach the provider.
 *
 *   2. `settleDisbursement` — called from the verified webhook. Claims the
 *      pending ledger row with a compare-and-set under a lock, then books the
 *      loan and schedules repayment.
 */
import type { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import { audit } from "./audit.js";
import { lockLoanApplication, lockTransaction, isUniqueViolation, LockContendedError } from "./db-lock.js";
import * as marzpay from "./marzpay.js";
import { PaymentProviderError } from "./marzpay.js";
import { config } from "./config.js";

/** Statuses in which a loan is considered to have money committed to it. */
export const LIVE_LOAN_STATUSES = ["disbursing", "active", "overdue"] as const;

export interface DisbursementResult {
  status: "pending" | "failed" | "already_requested" | "already_disbursed";
  applicationId: string;
  /** Our reference, echoed by the provider on callback. */
  reference: string | null;
  /** The provider's transaction id, once accepted. */
  providerRef: string | null;
  transactionId: string | null;
  amount: number;
  message: string;
  /** True when the provider outcome is unknown and needs reconciliation. */
  needsReconciliation?: boolean;
}

/**
 * Borrower accepts an approved offer; we request the payout.
 *
 * @param idempotencyKey Caller-supplied dedupe key (from the `Idempotency-Key`
 *   header). When omitted a deterministic key derived from the application id
 *   is used, which still collapses double-clicks onto one payout.
 */
export async function requestDisbursement(args: {
  applicantId: string;
  applicationId: string;
  idempotencyKey?: string;
}): Promise<DisbursementResult> {
  const { applicantId, applicationId } = args;
  // Deterministic default: two clicks on the same offer produce the same key,
  // so the UNIQUE constraint collapses them even without a client header.
  const idempotencyKey = args.idempotencyKey?.trim() || `disburse:${applicationId}`;

  // An earlier request with this key already did the work. Return its outcome
  // rather than starting a second payout.
  const existingByKey = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existingByKey) {
    return describeExisting(existingByKey, "Disbursement already requested for this loan.");
  }

  if (!marzpay.paymentsConfigured()) {
    // Fail loudly. Silently falling back to a wallet credit is exactly the bug
    // being remediated.
    throw new AppError("Disbursements are temporarily unavailable. Please try again shortly.", 503);
  }

  let claim: {
    txnId: string;
    reference: string;
    amount: number;
    phone: string;
    loanId: string;
  };

  try {
    claim = await prisma.$transaction(async (tx) => {
      const found = await lockLoanApplication(tx, applicationId);
      if (!found) throw new AppError("Loan offer not found", 404);

      const app = await tx.loanApplication.findUniqueOrThrow({ where: { id: applicationId } });

      // Borrower isolation: a user may only accept their own offer.
      if (app.applicantId !== applicantId) throw new AppError("Loan offer not found", 404);

      if (app.status === "disbursing") {
        throw new AppError("This loan is already being disbursed.", 409);
      }
      if (app.status === "active" || app.status === "paid" || app.status === "overdue") {
        throw new AppError("This loan has already been disbursed.", 409);
      }
      if (app.status !== "offered") {
        throw new AppError(`Loan is ${app.status}, not awaiting acceptance.`, 409);
      }
      if (app.acceptedAt) {
        throw new AppError("This loan is already being disbursed.", 409);
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: applicantId } });
      const phone = user.phone ?? "";
      // Validate the recipient BEFORE claiming, so a bad number does not park
      // the offer in `disbursing`.
      if (!marzpay.isValidUgandaMobile(phone)) {
        throw new AppError(
          "Add a valid Ugandan mobile money number to your profile before accepting this loan.",
          422
        );
      }

      // The amount comes from the server-side loan terms. The client never
      // supplies it and cannot influence it.
      const amount = Number(app.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new AppError("This loan has an invalid principal and cannot be disbursed.", 409);
      }

      const loanId = app.loanId ?? app.id;
      const reference = `LOAN-${app.id}`;

      // Claim the payout slot. Status leaves `offered` in the same transaction
      // that writes the pending ledger row, so a concurrent acceptance sees
      // `disbursing` (or loses the unique-index race) and never calls MarzPay.
      await tx.loanApplication.update({
        where: { id: app.id },
        data: { status: "disbursing", acceptedAt: new Date(), loanId },
      });

      const txn = await tx.transaction.create({
        data: {
          userId: applicantId,
          loanId,
          type: "loan_disbursement",
          amount: BigInt(Math.round(amount)),
          status: "pending",
          provider: "marzpay",
          reference,
          idempotencyKey,
        },
      });

      await audit(
        {
          actorId: applicantId,
          actorRole: "user",
          action: "loan.disbursement.requested",
          entityType: "loan_application",
          entityId: app.id,
          metadata: { amount, reference, transactionId: txn.id, idempotencyKey },
        },
        tx
      );

      return { txnId: txn.id, reference, amount, phone, loanId };
    });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("This loan is already being processed. Please wait a moment.", 409);
    }
    if (isUniqueViolation(err, "idempotency_key") || isUniqueViolation(err, "one_live_disbursement")) {
      // Lost the race to a concurrent request — that request owns the payout.
      const winner = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (winner) return describeExisting(winner, "Disbursement already in progress for this loan.");
      throw new AppError("This loan is already being disbursed.", 409);
    }
    throw err;
  }

  // ── Outside the DB transaction: call the provider ────────────────────────
  // Deliberately NOT inside `$transaction`: an open transaction must never wait
  // on a network round-trip, and a rollback cannot un-send a payout.
  let result: marzpay.MarzResult;
  try {
    result = await marzpay.disburse({
      phone: claim.phone,
      amount: claim.amount,
      reference: claim.reference,
      description: `Kuula loan ${claim.loanId}`,
      callbackUrl: marzpay.callbackUrl(),
    });
  } catch (err) {
    if (err instanceof PaymentProviderError && err.retryable) {
      // AMBIGUOUS outcome — MarzPay may have accepted the payout even though we
      // never saw the response. We must NOT release the lock and must NOT retry
      // onto a new payout. The row stays `pending`; the webhook or the
      // reconciliation sweep resolves it.
      await prisma.transaction.update({
        where: { id: claim.txnId },
        data: { failureReason: `provider-unreachable: ${err.message}` },
      });
      await audit({
        actorId: claim.txnId,
        action: "loan.disbursement.ambiguous",
        entityType: "transaction",
        entityId: claim.txnId,
        metadata: { reference: claim.reference, error: err.message },
      });
      return {
        status: "pending",
        applicationId,
        reference: claim.reference,
        providerRef: null,
        transactionId: claim.txnId,
        amount: claim.amount,
        needsReconciliation: true,
        message:
          "Your disbursement was submitted but we have not yet confirmed it with the payment provider. " +
          "We will notify you as soon as it settles.",
      };
    }
    await failDisbursement(claim.txnId, applicationId, `provider-error: ${(err as Error).message}`);
    throw new AppError("We could not reach the payment provider. Please try again shortly.", 502);
  }

  if (!result.ok) {
    // Definitive rejection: no money left MarzPay, so it is safe to release the
    // offer for a retry.
    await failDisbursement(claim.txnId, applicationId, result.message);
    return {
      status: "failed",
      applicationId,
      reference: claim.reference,
      providerRef: result.uuid || null,
      transactionId: claim.txnId,
      amount: claim.amount,
      message: `Disbursement was rejected by the payment provider: ${result.message}`,
    };
  }

  // Accepted — persist the provider reference so the callback can be matched.
  await prisma.transaction.update({
    where: { id: claim.txnId },
    data: { providerRef: result.uuid || claim.reference, transactionId: result.uuid || claim.reference },
  });
  await prisma.loanApplication.update({
    where: { id: applicationId },
    data: { disbursementRef: result.uuid || claim.reference, disbursementTxnId: claim.txnId },
  });

  await audit({
    actorId: claim.txnId,
    action: "loan.disbursement.accepted",
    entityType: "loan_application",
    entityId: applicationId,
    metadata: { providerRef: result.uuid, reference: claim.reference, amount: claim.amount },
  });

  await prisma.notification.create({
    data: {
      userId: applicantId,
      title: "Disbursement on its way",
      body:
        `Your loan of UGX ${claim.amount.toLocaleString()} is being sent to ${maskPhone(claim.phone)}. ` +
        `We will confirm as soon as it lands.`,
      type: "info",
    },
  });

  return {
    status: "pending",
    applicationId,
    reference: claim.reference,
    providerRef: result.uuid || null,
    transactionId: claim.txnId,
    amount: claim.amount,
    message: "Your loan is on its way to your mobile money account.",
  };
}

/** Release a claimed offer after a definitive provider rejection. */
async function failDisbursement(txnId: string, applicationId: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Only a still-pending row may be failed; if the webhook already settled it
    // (a very fast callback) we must not overwrite that.
    const claimed = await tx.transaction.updateMany({
      where: { id: txnId, status: "pending" },
      data: { status: "failed", failureReason: reason.slice(0, 500), settledAt: new Date() },
    });
    if (claimed.count === 0) return;

    await tx.loanApplication.updateMany({
      where: { id: applicationId, status: "disbursing" },
      data: { status: "offered", acceptedAt: null },
    });
  });

  await audit({
    action: "loan.disbursement.failed",
    entityType: "loan_application",
    entityId: applicationId,
    metadata: { transactionId: txnId, reason },
  });
}

function describeExisting(
  txn: { id: string; status: string; reference: string | null; providerRef: string | null; amount: bigint; loanId: string | null },
  message: string
): DisbursementResult {
  const status =
    txn.status === "completed" ? "already_disbursed" : txn.status === "failed" ? "failed" : "already_requested";
  return {
    status,
    applicationId: txn.reference?.startsWith("LOAN-") ? txn.reference.slice(5) : (txn.loanId ?? ""),
    reference: txn.reference,
    providerRef: txn.providerRef,
    transactionId: txn.id,
    amount: Number(txn.amount),
    message,
  };
}

// ── Settlement (called only from the verified webhook) ──────────────────────

export interface SettlementOutcome {
  applied: boolean;
  reason: string;
}

/**
 * Apply a confirmed disbursement outcome. Exactly once.
 *
 * `expectedAmount` is the amount the provider says moved. When present it must
 * match the pending ledger row, so a callback claiming a different figure than
 * the one we requested is rejected rather than booked.
 */
export async function settleDisbursement(args: {
  transactionId: string;
  success: boolean;
  providerRef?: string | null;
  providerAmount?: number | null;
  reason?: string;
}): Promise<SettlementOutcome> {
  return prisma.$transaction(async (tx) => {
    const found = await lockTransaction(tx, args.transactionId);
    if (!found) return { applied: false, reason: "transaction-not-found" };

    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: args.transactionId } });

    // Compare-and-set: only a pending row may be settled. A duplicate,
    // concurrent, or replayed callback finds a non-pending row and is a no-op.
    if (txn.status !== "pending") {
      return { applied: false, reason: `already-${txn.status}` };
    }
    if (txn.type !== "loan_disbursement") {
      return { applied: false, reason: "wrong-transaction-type" };
    }

    const ledgerAmount = Number(txn.amount);
    if (args.providerAmount != null && Math.round(args.providerAmount) !== ledgerAmount) {
      // The provider reports a different amount than we requested. Never book
      // this — flag it for a human.
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          failureReason: `amount-mismatch: expected ${ledgerAmount}, provider reported ${args.providerAmount}`,
        },
      });
      await audit(
        {
          action: "loan.disbursement.amount_mismatch",
          entityType: "transaction",
          entityId: txn.id,
          metadata: { expected: ledgerAmount, reported: args.providerAmount },
        },
        tx
      );
      return { applied: false, reason: "amount-mismatch" };
    }

    const applicationId = txn.reference?.startsWith("LOAN-") ? txn.reference.slice(5) : null;

    if (!args.success) {
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          status: "failed",
          settledAt: new Date(),
          failureReason: (args.reason ?? "provider reported failure").slice(0, 500),
          providerRef: args.providerRef || txn.providerRef,
        },
      });
      if (applicationId) {
        // No money moved, so the borrower may accept again.
        await tx.loanApplication.updateMany({
          where: { id: applicationId, status: "disbursing" },
          data: { status: "offered", acceptedAt: null },
        });
      }
      await tx.notification.create({
        data: {
          userId: txn.userId,
          title: "Disbursement failed",
          body: "We could not send your loan to your mobile money account. Please check your number and try again.",
          type: "alert",
        },
      });
      await audit(
        {
          action: "loan.disbursement.settled_failed",
          entityType: "transaction",
          entityId: txn.id,
          metadata: { applicationId, reason: args.reason },
        },
        tx
      );
      return { applied: true, reason: "failed" };
    }

    // ── Success: the money has actually left. Book the loan. ────────────────
    await tx.transaction.update({
      where: { id: txn.id },
      data: {
        status: "completed",
        settledAt: new Date(),
        providerRef: args.providerRef || txn.providerRef,
      },
    });

    if (!applicationId) {
      return { applied: true, reason: "settled-without-application" };
    }

    await lockLoanApplication(tx, applicationId);
    const app = await tx.loanApplication.findUnique({ where: { id: applicationId } });
    if (!app) return { applied: true, reason: "settled-orphan-transaction" };

    const loanId = app.loanId ?? app.id;
    const principal = Number(app.amount);
    const total = Math.max(Number(app.total), principal);

    await tx.loanApplication.update({
      where: { id: app.id },
      data: { status: "active", disbursedAt: new Date(), disbursementTxnId: txn.id, loanId },
    });

    // Schedule repayment idempotently — a second settlement attempt for the
    // same loan must not create a second debt.
    const existingRepayment = await tx.repayment.findFirst({ where: { userId: app.applicantId, loanId } });
    if (!existingRepayment) {
      await tx.repayment.create({
        data: {
          userId: app.applicantId,
          loanId,
          total: BigInt(Math.round(total)),
          amountPaid: BigInt(0),
          dueDate: new Date(Date.now() + app.termDays * 86_400_000),
          status: "scheduled",
          attempts: [] as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await tx.user.update({
      where: { id: app.applicantId },
      data: { loansTotal: { increment: 1 } },
    });

    await tx.notification.create({
      data: {
        userId: app.applicantId,
        title: "Loan disbursed",
        body: `UGX ${principal.toLocaleString()} has been sent to your mobile money account.`,
        type: "success",
      },
    });

    await audit(
      {
        action: "loan.disbursement.settled_success",
        entityType: "loan_application",
        entityId: app.id,
        metadata: { transactionId: txn.id, providerRef: args.providerRef, amount: principal, loanId },
      },
      tx
    );

    return { applied: true, reason: "disbursed" };
  });
}

/**
 * Reconcile disbursements whose outcome we never learned (provider timeout, or
 * a callback that never arrived). Asks MarzPay what really happened and settles
 * through the same exactly-once path the webhook uses.
 */
export async function reconcilePendingDisbursements(olderThanMs = 10 * 60_000): Promise<number> {
  if (!marzpay.paymentsConfigured() || !config.marzpay.verifyCallbacks) return 0;

  const stale = await prisma.transaction.findMany({
    where: {
      type: "loan_disbursement",
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
      const outcome = await settleDisbursement({
        transactionId: txn.id,
        success: status.success,
        providerRef: txn.providerRef,
        providerAmount: status.amount,
        reason: `reconciliation: provider status ${status.status}`,
      });
      if (outcome.applied) settled += 1;
    } catch (err) {
      console.error("[reconcile] disbursement", txn.id, (err as Error).message);
    }
  }
  return settled;
}

function maskPhone(phone: string): string {
  const local = marzpay.toLocalPhone(phone);
  return local.length >= 4 ? `${local.slice(0, 3)}•••${local.slice(-3)}` : "your number";
}
