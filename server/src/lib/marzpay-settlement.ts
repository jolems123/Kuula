import { Prisma, type Transaction } from "@prisma/client";
import prisma from "./prisma.js";
import type { MarzPayWebhookEvent } from "./marzpay.js";
import { postSettlementJournal } from "./ledger.js";
import { dispatchNextDisbursementLeg } from "./disbursements.js";
import { writeAuditEvent } from "./audit.js";

/**
 * Applies one final or interim MarzPay status (from an authenticated callback, a status
 * lookup, or a staff-triggered verification) to Kuula's records. Every money-changing
 * step claims a still-pending row atomically, so repeated or concurrent deliveries of
 * the same event can never post twice.
 */
export interface SettlementOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

interface LinkedLeg {
  leg_id: string;
  batch_id: string;
  sequence: number;
  leg_amount: bigint;
  leg_status: string;
  approved_amount: bigint;
  total_settled: bigint;
  application_id: string;
  user_id: string;
  loan_id: string;
}

/** Transactions whose outcome is not yet known; a provider-confirmed status may settle them. */
export const AWAITING_PROVIDER = "awaiting_provider";

function attemptsArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

function currencyMismatch(event: MarzPayWebhookEvent): boolean {
  return Boolean(event.currency) && event.currency !== "UGX";
}

async function findTransaction(event: MarzPayWebhookEvent): Promise<Transaction | null> {
  for (const reference of [event.reference, event.alternateReference]) {
    if (!reference) continue;
    const found = await prisma.transaction.findUnique({ where: { reference } });
    if (found) return found;
  }
  return null;
}

export async function settleMarzPayEvent(event: MarzPayWebhookEvent): Promise<SettlementOutcome> {
  if (!event.reference && !event.alternateReference) {
    return { httpStatus: 400, body: { error: "Webhook transaction reference is required" } };
  }
  const ledger = await findTransaction(event);
  if (!ledger) {
    console.warn(JSON.stringify({ event: "marzpay.unknown_reference", reference: event.reference, alternate: event.alternateReference }));
    return { httpStatus: 404, body: { error: "Unknown transaction reference" } };
  }
  if (ledger.provider !== "marzpay") return { httpStatus: 409, body: { error: "Transaction provider mismatch" } };
  // From here on, always use Kuula's stored reference.
  const settled = { ...event, reference: ledger.reference! };
  return ledger.type === "loan_disbursement_leg" ? settleDisbursementLeg(settled, ledger) : settleTransaction(settled, ledger);
}

async function holdForReconciliation(ledger: Transaction, event: MarzPayWebhookEvent, reason: string, legAndBatch?: { legId: string; batchId: string }) {
  const statements: Prisma.PrismaPromise<unknown>[] = [
    prisma.transaction.update({
      where: { id: ledger.id },
      data: {
        providerAmount: event.amount === null ? null : BigInt(event.amount),
        providerCurrency: event.currency || null,
        reconciliationStatus: "reconciliation_required",
        providerPayload: event.payload as Prisma.InputJsonValue,
      },
    }),
  ];
  if (legAndBatch) {
    statements.push(
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='attention_required', failure_reason=${reason}, updated_at=CURRENT_TIMESTAMP WHERE id=${legAndBatch.legId}::uuid`),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status='attention_required', failure_reason=${reason}, updated_at=CURRENT_TIMESTAMP WHERE id=${legAndBatch.batchId}::uuid`),
    );
  }
  await prisma.$transaction(statements);
}

async function settleDisbursementLeg(event: MarzPayWebhookEvent, ledger: Transaction): Promise<SettlementOutcome> {
  const linked = await prisma.$queryRaw<LinkedLeg[]>(Prisma.sql`
    SELECT l.id AS leg_id, l.batch_id, l.sequence, l.amount AS leg_amount, l.status AS leg_status,
           b.approved_amount, b.total_settled, b.application_id, b.user_id, b.loan_id
    FROM disbursement_legs l
    JOIN disbursement_batches b ON b.id=l.batch_id
    WHERE l.reference=${event.reference}
    LIMIT 1
  `);
  const leg = linked[0];
  if (!leg) return { httpStatus: 409, body: { error: "Disbursement ledger linkage is invalid" } };
  const scope = { legId: leg.leg_id, batchId: leg.batch_id };

  // A mismatch is a hard stop: later events cannot settle until staff have reviewed it.
  if (ledger.status === "pending" && ledger.reconciliationStatus === "reconciliation_required") {
    return { httpStatus: 409, body: { error: "This disbursement transaction requires reconciliation review before settlement can continue", code: "DISBURSEMENT_RECONCILIATION_REQUIRED" } };
  }
  if (event.uuid && ledger.transactionId && event.uuid !== ledger.transactionId) {
    await holdForReconciliation(ledger, event, "Provider transaction identifier mismatch", scope);
    return { httpStatus: 409, body: { error: "Provider transaction identifier mismatch" } };
  }
  if (ledger.status === "pending" && event.isFinal && event.isSuccess && (event.amount === null || event.amount !== Number(ledger.amount) || currencyMismatch(event))) {
    await holdForReconciliation(ledger, event, "Provider amount or currency mismatch", scope);
    return { httpStatus: 409, body: { error: "Provider amount does not match the expected disbursement leg" } };
  }

  if (!event.isFinal) {
    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { id: ledger.id, status: "pending" },
        data: { providerStatus: event.status, transactionId: event.uuid || ledger.transactionId, providerPayload: event.payload as Prisma.InputJsonValue },
      }),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET provider_status=${event.status}, provider_transaction_id=${event.uuid || null}, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.leg_id}::uuid AND status IN ('dispatching','pending')`),
    ]);
    return { httpStatus: 200, body: { received: true, pending: true, batchId: leg.batch_id, sequence: leg.sequence } };
  }

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: event.isSuccess ? "completed" : "failed",
        providerStatus: event.status,
        transactionId: event.uuid || ledger.transactionId,
        providerPayload: event.payload as Prisma.InputJsonValue,
        providerAmount: event.amount === null ? null : BigInt(event.amount),
        providerCurrency: event.currency || (event.amount === null ? null : "UGX"),
        providerFee: event.charge === null ? ledger.providerFee : BigInt(event.charge),
        reconciliationStatus: event.isSuccess ? "matched" : "reconciliation_required",
        reconciledAt: event.isSuccess ? new Date() : null,
      },
    });
    if (claim.count !== 1) return { settled: false, complete: false, shouldDispatchNext: false };

    if (event.isSuccess) {
      await postSettlementJournal(tx, { ...ledger, providerFee: event.charge === null ? ledger.providerFee : BigInt(event.charge) });
      await tx.$executeRaw(Prisma.sql`
        UPDATE disbursement_legs
        SET status='settled', provider_status=${event.status}, provider_transaction_id=${event.uuid || null}, settled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=${leg.leg_id}::uuid
      `);
      const totals = await tx.$queryRaw<Array<{ settled: bigint; unsettled: bigint }>>(Prisma.sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE status='settled'),0)::bigint AS settled,
               COUNT(*) FILTER (WHERE status <> 'settled')::bigint AS unsettled
        FROM disbursement_legs WHERE batch_id=${leg.batch_id}::uuid
      `);
      const totalSettled = Number(totals[0]?.settled || 0);
      const complete = totalSettled === Number(leg.approved_amount) && Number(totals[0]?.unsettled || 0) === 0;

      if (complete) {
        const application = await tx.loanApplication.findUnique({ where: { id: leg.application_id } });
        if (!application) throw new Error("Loan application for disbursement batch was not found");
        const dueDate = new Date(Date.now() + application.termDays * 86_400_000);
        const existingRepayment = await tx.repayment.findFirst({ where: { userId: leg.user_id, loanId: leg.loan_id } });
        if (!existingRepayment) {
          await tx.repayment.create({
            data: { userId: leg.user_id, loanId: leg.loan_id, total: application.total, amountPaid: BigInt(0), dueDate, status: "scheduled", attempts: [] },
          });
        }
        await tx.$executeRaw(Prisma.sql`
          UPDATE disbursement_batches SET total_settled=${BigInt(totalSettled)}, status='settled', failure_reason=NULL, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
        `);
        await tx.loanApplication.update({ where: { id: leg.application_id }, data: { status: "active", dueDate, disbursementRef: event.uuid || event.reference } });
        await tx.user.update({ where: { id: leg.user_id }, data: { loansTotal: { increment: 1 } } });
        await tx.notification.create({
          data: { userId: leg.user_id, title: "Loan Disbursed", body: `Your full UGX ${Number(leg.approved_amount).toLocaleString()} loan has been sent to Mobile Money.`, type: "success" },
        });
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE disbursement_batches SET total_settled=${BigInt(totalSettled)}, status='partially_disbursed', failure_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
        `);
        await tx.notification.create({
          data: { userId: leg.user_id, title: "Loan Disbursement Progress", body: `UGX ${Number(leg.leg_amount).toLocaleString()} was sent successfully. The remaining approved amount is being processed.`, type: "info" },
        });
      }
      return { settled: true, complete, shouldDispatchNext: !complete };
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_legs SET status='failed', provider_status=${event.status}, provider_transaction_id=${event.uuid || null}, failure_reason='Provider declined or failed the disbursement', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.leg_id}::uuid
    `);
    const totals = await tx.$queryRaw<Array<{ settled: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(amount) FILTER (WHERE status='settled'),0)::bigint AS settled FROM disbursement_legs WHERE batch_id=${leg.batch_id}::uuid
    `);
    const totalSettled = Number(totals[0]?.settled || 0);
    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_batches SET total_settled=${BigInt(totalSettled)}, status=${totalSettled > 0 ? "attention_required" : "failed"}, failure_reason='Provider declined or failed the disbursement', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
    `);
    await tx.notification.create({
      data: {
        userId: leg.user_id,
        title: totalSettled > 0 ? "Disbursement Partially Completed" : "Disbursement Failed",
        body: totalSettled > 0
          ? `UGX ${totalSettled.toLocaleString()} has been received, but the remaining disbursement needs Kuula review. No duplicate payment will be made automatically.`
          : "The Mobile Money disbursement was not completed. Kuula will not mark the loan active until the issue is resolved.",
        type: "warning",
      },
    });
    return { settled: true, complete: false, shouldDispatchNext: false };
  });

  if (result.settled) {
    await writeAuditEvent({
      subjectUserId: leg.user_id,
      action: event.isSuccess ? "loan.disbursement_leg_settled" : "loan.disbursement_leg_failed",
      resourceType: "disbursement_batch",
      resourceId: leg.batch_id,
      metadata: { applicationId: leg.application_id, sequence: leg.sequence, reference: event.reference, amount: event.amount, charge: event.charge, providerUuid: event.uuid },
    });
  }

  if (result.shouldDispatchNext) {
    const nextLeg = await dispatchNextDisbursementLeg(leg.batch_id);
    if (!nextLeg.dispatched && nextLeg.reason !== "no-dispatchable-leg" && nextLeg.outcome !== "unknown") {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE disbursement_batches SET status='attention_required', failure_reason=${nextLeg.reason || "Next disbursement leg could not be dispatched"}, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
      `);
    }
  }

  return { httpStatus: 200, body: { received: true, settled: result.settled, complete: result.complete, batchId: leg.batch_id, sequence: leg.sequence } };
}

async function settleTransaction(event: MarzPayWebhookEvent, ledger: Transaction): Promise<SettlementOutcome> {
  if (event.uuid && ledger.transactionId && event.uuid !== ledger.transactionId) {
    await holdForReconciliation(ledger, event, "Provider transaction identifier mismatch");
    return { httpStatus: 409, body: { error: "Provider transaction identifier mismatch" } };
  }
  if (ledger.status === "pending" && event.isFinal && event.isSuccess && (event.amount === null || event.amount !== Number(ledger.amount) || currencyMismatch(event))) {
    await holdForReconciliation(ledger, event, "Provider amount or currency mismatch");
    return { httpStatus: 409, body: { error: "Provider amount does not match the expected transaction amount" } };
  }

  if (!event.isFinal) {
    await prisma.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: { providerStatus: event.status, transactionId: event.uuid || ledger.transactionId, providerPayload: event.payload as Prisma.InputJsonValue },
    });
    return { httpStatus: 200, body: { received: true, pending: true } };
  }

  const providerFee = event.charge === null ? ledger.providerFee : BigInt(event.charge);
  const outcome = await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: event.isSuccess ? "completed" : "failed",
        providerStatus: event.status,
        transactionId: event.uuid || ledger.transactionId,
        providerPayload: event.payload as Prisma.InputJsonValue,
        providerAmount: event.amount === null ? null : BigInt(event.amount),
        providerCurrency: event.currency || (event.amount === null ? null : "UGX"),
        providerFee,
        // A failure is a final provider fact but still needs a person to confirm the customer outcome.
        reconciliationStatus: event.isSuccess ? "matched" : "reconciliation_required",
        reconciledAt: event.isSuccess ? new Date() : null,
      },
    });
    if (claim.count !== 1) return { settled: false, unapplied: false };

    // The journal is posted inside this database transaction, so settlement status,
    // balances and accounting either all commit or all roll back.
    if (event.isSuccess) await postSettlementJournal(tx, { ...ledger, providerFee });

    if (ledger.type === "loan_disbursement" && ledger.loanId) {
      await settleLegacyDisbursement(tx, ledger, event);
      return { settled: true, unapplied: false };
    }
    if (ledger.type === "loan_payment" && ledger.loanId) {
      const unapplied = await settleRepayment(tx, ledger, event);
      return { settled: true, unapplied };
    }
    return { settled: true, unapplied: false };
  });

  if (outcome.settled) {
    await writeAuditEvent({
      subjectUserId: ledger.userId,
      action: event.isSuccess ? "payment.provider_settled" : "payment.provider_failed",
      resourceType: "transaction",
      resourceId: ledger.id,
      metadata: { reference: event.reference, providerUuid: event.uuid, type: ledger.type, amount: event.amount, charge: event.charge, unapplied: outcome.unapplied },
    });
  }
  return { httpStatus: 200, body: { received: true, settled: outcome.settled, ...(event.isFailure ? { failed: true } : {}), ...(outcome.unapplied ? { unapplied: true } : {}) } };
}

async function settleLegacyDisbursement(tx: Prisma.TransactionClient, ledger: Transaction, event: MarzPayWebhookEvent) {
  const application = await tx.loanApplication.findFirst({ where: { applicantId: ledger.userId, loanId: ledger.loanId } });
  if (!application) throw new Error("Loan application for disbursement was not found");
  if (event.isSuccess) {
    const dueDate = new Date(Date.now() + application.termDays * 86_400_000);
    const existingRepayment = await tx.repayment.findFirst({ where: { userId: ledger.userId, loanId: ledger.loanId! } });
    if (!existingRepayment) {
      await tx.repayment.create({ data: { userId: ledger.userId, loanId: ledger.loanId!, total: application.total, amountPaid: BigInt(0), dueDate, status: "scheduled", attempts: [] } });
    }
    await tx.loanApplication.update({ where: { id: application.id }, data: { status: "active", dueDate, disbursementRef: event.uuid || event.reference } });
    await tx.user.update({ where: { id: ledger.userId }, data: { loansTotal: { increment: 1 } } });
    await tx.notification.create({ data: { userId: ledger.userId, title: "Loan Disbursed", body: `UGX ${Number(ledger.amount).toLocaleString()} has been sent to your mobile money.`, type: "success" } });
    return;
  }
  await tx.loanApplication.updateMany({
    where: { id: application.id, status: "disbursing" },
    data: { status: "offered", acceptedAt: null, disbursementRef: event.uuid || event.reference, decisionNotes: "Mobile-money disbursement failed. The offer can be retried while still valid." },
  });
  await tx.notification.create({ data: { userId: ledger.userId, title: "Disbursement Failed", body: "We could not send your loan to mobile money. Your balance was not changed.", type: "warning" } });
}

/** Returns true when confirmed money could not be applied to any open repayment. */
async function settleRepayment(tx: Prisma.TransactionClient, ledger: Transaction, event: MarzPayWebhookEvent): Promise<boolean> {
  const paymentAmount = Number(ledger.amount);
  // Prefer the repayment this collection was raised against; if that link was cleared
  // (for example after an earlier timeout), apply it to the borrower's open repayment.
  const repayment = await tx.repayment.findFirst({ where: { userId: ledger.userId, loanId: ledger.loanId!, pendingCollectionRef: event.reference } })
    ?? (event.isSuccess ? await tx.repayment.findFirst({ where: { userId: ledger.userId, loanId: ledger.loanId!, status: { not: "paid" } } }) : null);

  if (!event.isSuccess) {
    if (repayment && repayment.pendingCollectionRef === event.reference) {
      await tx.repayment.update({
        where: { id: repayment.id },
        data: {
          pendingCollectionRef: null,
          attempts: [...attemptsArray(repayment.attempts), { at: new Date().toISOString(), method: "mobile-money-collection", amount: paymentAmount, success: false, reason: "provider-declined-or-failed", reference: event.reference, provider_uuid: event.uuid }] as Prisma.InputJsonValue,
        },
      });
    }
    await tx.notification.create({ data: { userId: ledger.userId, title: "Payment Not Completed", body: "The mobile-money repayment was not completed. Your loan balance was not changed.", type: "warning" } });
    return false;
  }

  const outstanding = repayment ? Number(repayment.total) - Number(repayment.amountPaid) : 0;
  if (!repayment || outstanding <= 0) {
    // Money was received but there is nothing open to apply it to: a possible refund case.
    await tx.transaction.update({ where: { id: ledger.id }, data: { reconciliationStatus: "reconciliation_required" } });
    return true;
  }
  const applied = Math.min(outstanding, paymentAmount);
  const newPaid = Number(repayment.amountPaid) + applied;
  const fullyPaid = newPaid >= Number(repayment.total);
  const receiptId = `RCPT-${event.reference.slice(0, 8).toUpperCase()}`;
  await tx.repayment.update({
    where: { id: repayment.id },
    data: {
      amountPaid: BigInt(newPaid),
      status: fullyPaid ? "paid" : repayment.status,
      receiptId,
      pendingCollectionRef: repayment.pendingCollectionRef === event.reference ? null : repayment.pendingCollectionRef,
      attempts: [...attemptsArray(repayment.attempts), { at: new Date().toISOString(), method: "mobile-money-collection", amount: paymentAmount, applied, success: true, reason: "provider-confirmed", reference: event.reference, provider_uuid: event.uuid, receipt_id: receiptId }] as Prisma.InputJsonValue,
    },
  });
  if (applied < paymentAmount) {
    // Overpayment: keep the excess visible for a refund decision instead of silently dropping it.
    await tx.transaction.update({ where: { id: ledger.id }, data: { reconciliationStatus: "reconciliation_required" } });
  }
  if (fullyPaid) {
    await tx.loanApplication.updateMany({ where: { applicantId: ledger.userId, loanId: ledger.loanId!, status: { not: "paid" } }, data: { status: "paid" } });
    await tx.user.update({ where: { id: ledger.userId }, data: { loansRepaid: { increment: 1 } } });
  }
  await tx.notification.create({
    data: {
      userId: ledger.userId,
      title: fullyPaid ? "Loan Repaid" : "Payment Received",
      body: fullyPaid ? `Your loan is fully paid. Receipt: ${receiptId}.` : `UGX ${paymentAmount.toLocaleString()} was received. Receipt: ${receiptId}.`,
      type: "success",
    },
  });
  return applied < paymentAmount;
}
