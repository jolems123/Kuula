import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook } from "../lib/marzpay.js";
import { postSettlementJournal } from "../lib/ledger.js";
import { dispatchNextDisbursementLeg } from "../lib/disbursements.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

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
  beneficiary_type: "customer" | "partner";
}

router.post("/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  // Final events reaching this handler have already been replaced by an
  // authenticated MarZPay transaction-details response in the provider
  // verification middleware. The original callback is never sufficient to
  // settle a disbursement leg.
  const event = parseMarzPayWebhook(req.body);
  if (!event.reference) return next();

  const linked = await prisma.$queryRaw<LinkedLeg[]>(Prisma.sql`
    SELECT l.id AS leg_id, l.batch_id, l.sequence, l.amount AS leg_amount, l.status AS leg_status,
           b.approved_amount, b.total_settled, b.application_id, b.user_id, b.loan_id, b.beneficiary_type
    FROM disbursement_legs l
    JOIN disbursement_batches b ON b.id=l.batch_id
    WHERE l.reference=${event.reference}
    LIMIT 1
  `);
  const leg = linked[0];
  if (!leg) return next();

  const ledger = await prisma.transaction.findUnique({ where: { reference: event.reference } });
  if (!ledger || ledger.type !== "loan_disbursement_leg" || ledger.provider !== "marzpay") {
    res.status(409).json({ error: "Disbursement ledger linkage is invalid" });
    return;
  }

  // Informational callbacks are non-authoritative. Initiation already stores
  // provider status/UUID; only a provider-verified final state can mutate money.
  if (!event.isFinal) {
    res.json({ received: true, pending: true, batchId: leg.batch_id, sequence: leg.sequence });
    return;
  }

  if (!ledger.transactionId || !event.uuid || event.uuid !== ledger.transactionId) {
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: ledger.id }, data: { reconciliationStatus: "reconciliation_required" } }),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='attention_required', failure_reason='Provider transaction identifier mismatch', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.leg_id}::uuid`),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status='attention_required', failure_reason='Provider transaction identifier mismatch', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid`),
    ]);
    res.status(409).json({ error: "Provider transaction identifier mismatch" });
    return;
  }
  if (event.amount === null || event.amount !== Number(ledger.amount)) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: ledger.id },
        data: {
          providerAmount: event.amount === null ? null : BigInt(event.amount),
          providerCurrency: "UGX",
          reconciliationStatus: "reconciliation_required",
          providerPayload: event.payload as Prisma.InputJsonValue,
        },
      }),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='attention_required', failure_reason='Provider amount mismatch', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.leg_id}::uuid`),
      prisma.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status='attention_required', failure_reason='Provider amount mismatch', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid`),
    ]);
    res.status(409).json({ error: "Provider amount does not match the expected disbursement leg" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: event.isSuccess ? "completed" : "failed",
        providerStatus: event.status,
        transactionId: event.uuid,
        providerPayload: event.payload as Prisma.InputJsonValue,
        providerAmount: BigInt(event.amount!),
        providerCurrency: "UGX",
        reconciliationStatus: event.isSuccess ? "matched" : "provider_failed_verified",
        reconciledAt: new Date(),
      },
    });
    if (claim.count !== 1) return { settled: false, complete: false, shouldDispatchNext: false };

    if (event.isSuccess) {
      await postSettlementJournal(tx, ledger);
      await tx.$executeRaw(Prisma.sql`
        UPDATE disbursement_legs
        SET status='settled', provider_status=${event.status}, provider_transaction_id=${event.uuid}, settled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=${leg.leg_id}::uuid
      `);

      const totals = await tx.$queryRaw<Array<{ settled: bigint; unsettled: bigint }>>(Prisma.sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE status='settled'),0)::bigint AS settled,
               COUNT(*) FILTER (WHERE status <> 'settled')::bigint AS unsettled
        FROM disbursement_legs WHERE batch_id=${leg.batch_id}::uuid
      `);
      const totalSettled = Number(totals[0]?.settled || 0);
      const remainingLegs = Number(totals[0]?.unsettled || 0);
      const complete = totalSettled === Number(leg.approved_amount) && remainingLegs === 0;

      const application = await tx.loanApplication.findUnique({ where: { id: leg.application_id } });
      if (!application) throw new Error("Loan application for disbursement batch was not found");
      const existingRepayment = await tx.repayment.findFirst({ where: { userId: leg.user_id, loanId: leg.loan_id } });

      // A borrower has a real obligation as soon as the first tranche settles.
      // Service the amount actually received immediately rather than waiting for
      // the last tranche. Interest/repayment are prorated until the full approved
      // principal settles; final settlement restores the exact contractual total.
      const approvedPrincipal = Math.max(1, Number(application.amount));
      const proportionalTotal = complete
        ? Number(application.total)
        : Math.max(totalSettled, Math.round(Number(application.total) * totalSettled / approvedPrincipal));
      const dueDate = existingRepayment?.dueDate ?? new Date(Date.now() + application.termDays * 86_400_000);

      if (!existingRepayment) {
        await tx.repayment.create({
          data: {
            userId: leg.user_id,
            loanId: leg.loan_id,
            total: BigInt(proportionalTotal),
            amountPaid: BigInt(0),
            dueDate,
            status: "scheduled",
            attempts: [],
          },
        });
        await tx.user.update({ where: { id: leg.user_id }, data: { loansTotal: { increment: 1 } } });
      } else if (Number(existingRepayment.total) !== proportionalTotal) {
        await tx.repayment.update({
          where: { id: existingRepayment.id },
          data: { total: BigInt(proportionalTotal), dueDate },
        });
      }

      if (complete) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE disbursement_batches SET total_settled=${BigInt(totalSettled)}, status='settled', failure_reason=NULL, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
        `);
        await tx.loanApplication.update({
          where: { id: leg.application_id },
          data: { status: "active", dueDate, disbursementRef: event.uuid },
        });
        await tx.notification.create({
          data: {
            userId: leg.user_id,
            title: "Loan Disbursed",
            body: leg.beneficiary_type === "partner"
              ? `Your full UGX ${Number(leg.approved_amount).toLocaleString()} approved financing has been settled to the verified provider.`
              : `Your full UGX ${Number(leg.approved_amount).toLocaleString()} loan has been sent to Mobile Money.`,
            type: "success",
          },
        });
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE disbursement_batches SET total_settled=${BigInt(totalSettled)}, status='partially_disbursed', failure_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
        `);
        await tx.loanApplication.update({
          where: { id: leg.application_id },
          data: { dueDate },
        });
        await tx.notification.create({
          data: {
            userId: leg.user_id,
            title: "Loan Disbursement Progress",
            body: `UGX ${Number(leg.leg_amount).toLocaleString()} was settled successfully. Your repayment obligation currently reflects only the amount actually settled while the remaining approved amount is processed.`,
            type: "info",
          },
        });
      }
      return { settled: true, complete, shouldDispatchNext: !complete };
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_legs SET status='failed', provider_status=${event.status}, provider_transaction_id=${event.uuid}, failure_reason='Provider declined or failed the disbursement', updated_at=CURRENT_TIMESTAMP WHERE id=${leg.leg_id}::uuid
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
          ? `UGX ${totalSettled.toLocaleString()} has already settled. Your repayment record covers the amount actually settled; the remaining transfer requires Kuula review and will not be duplicated automatically.`
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
      metadata: {
        applicationId: leg.application_id,
        sequence: leg.sequence,
        reference: event.reference,
        amount: event.amount,
        providerUuid: event.uuid,
        providerVerified: true,
      },
    });
  }

  if (result.shouldDispatchNext) {
    const nextLeg = await dispatchNextDisbursementLeg(leg.batch_id);
    if (!nextLeg.dispatched && nextLeg.reason !== "no-dispatchable-leg") {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE disbursement_batches SET status='attention_required', failure_reason=${nextLeg.reason || "Next disbursement leg could not be dispatched"}, updated_at=CURRENT_TIMESTAMP WHERE id=${leg.batch_id}::uuid
      `);
    }
  }

  res.json({ received: true, settled: result.settled, complete: result.complete, batchId: leg.batch_id, sequence: leg.sequence });
});

export default router;
