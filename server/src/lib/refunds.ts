import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import {
  buildMarzPayWebhookUrl,
  createPaymentReference,
  marzPayConfigured,
  normalizeMarzPayAmount,
  normalizeUgandaMobileMoneyPhone,
  sendMoney,
} from "./marzpay.js";
import type { RefundSourceAccount } from "./ledger.js";

/**
 * Two-person refunds of customer money Kuula holds but could not apply to a loan (an
 * overpayment, or a collection that matched no open loan). One person requests; a
 * different person with payout-release permission approves and sends. The refund's
 * journal is posted only when MarzPay confirms the transfer (lib/marzpay-settlement.ts).
 */
interface HeldRow {
  transaction_id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  reference: string;
  account: RefundSourceAccount;
  held: bigint;
  refunding: bigint;
  received_at: Date;
}

export interface RefundableSource {
  transactionId: string;
  userId: string;
  customerName: string;
  phone: string | null;
  reference: string;
  account: RefundSourceAccount;
  held: number;
  alreadyRefunding: number;
  refundable: number;
  receivedAt: Date;
}

function heldMoneyQuery(transactionId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT t.id AS transaction_id, t.user_id, u.full_name, u.phone, t.reference, e.account_code AS account, e.amount AS held,
           COALESCE((SELECT SUM(r.amount) FROM refund_requests r
                     WHERE r.source_transaction_id=t.id AND r.status IN ('requested','approved','sent','completed')),0)::bigint AS refunding,
           t.updated_at AS received_at
    FROM transactions t
    JOIN journals j ON j.transaction_id=t.id
    JOIN journal_entries e ON e.journal_id=j.id AND e.direction='credit'
                          AND e.account_code IN ('UNAPPLIED_CUSTOMER_FUNDS','LOAN_COLLECTIONS_SUSPENSE')
    JOIN users u ON u.id=t.user_id
    WHERE t.type='loan_payment' AND t.status='completed'
      ${transactionId ? Prisma.sql`AND t.id=${transactionId}::uuid` : Prisma.empty}
    ORDER BY t.updated_at DESC
    LIMIT 200
  `;
}

function toSource(row: HeldRow): RefundableSource {
  return {
    transactionId: row.transaction_id,
    userId: row.user_id,
    customerName: row.full_name || "",
    phone: row.phone,
    reference: row.reference,
    account: row.account,
    held: Number(row.held),
    alreadyRefunding: Number(row.refunding),
    refundable: Number(row.held) - Number(row.refunding),
    receivedAt: row.received_at,
  };
}

/** Collections whose money is (partly) held for the customer, with what can still be refunded. */
export async function refundableSources(): Promise<RefundableSource[]> {
  return (await prisma.$queryRaw<HeldRow[]>(heldMoneyQuery())).map(toSource);
}

export async function requestRefund(params: { sourceTransactionId: string; amount: number; reason: string; requestedBy: string }): Promise<string> {
  const reason = params.reason.trim();
  if (reason.length < 20) throw new AppError("Explain the refund in at least 20 characters", 400);
  const amount = Math.round(Number(params.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("Refund amount must be positive", 400);
  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    // Lock the source so two concurrent requests cannot both draw on the same held money.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM transactions WHERE id=${params.sourceTransactionId}::uuid FOR UPDATE`);
    const rows = await tx.$queryRaw<HeldRow[]>(heldMoneyQuery(params.sourceTransactionId));
    const source = rows[0] ? toSource(rows[0]) : null;
    if (!source) throw new AppError("This payment holds no customer money to refund", 404);
    if (amount > source.refundable) throw new AppError(`At most UGX ${source.refundable.toLocaleString()} can still be refunded from this payment`, 422);
    if (!source.phone) throw new AppError("The customer has no phone number to refund to", 422);
    const phone = normalizeUgandaMobileMoneyPhone(source.phone);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO refund_requests (id, user_id, source_transaction_id, source_account, amount, phone, reason, status, requested_by)
      VALUES (${id}::uuid, ${source.userId}::uuid, ${source.transactionId}::uuid, ${source.account}, ${BigInt(amount)}, ${phone}, ${reason}, 'requested', ${params.requestedBy}::uuid)
    `);
  });
  return id;
}

interface RefundRow {
  id: string;
  user_id: string;
  source_transaction_id: string;
  amount: bigint;
  phone: string;
  status: string;
  requested_by: string;
}

export async function approveAndSendRefund(params: { refundId: string; approvedBy: string }): Promise<{ status: string; reference: string; message: string }> {
  if (!marzPayConfigured()) throw new AppError("Real-money movement is disabled, so refunds cannot be sent", 503);
  const reference = createPaymentReference();
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<RefundRow[]>(Prisma.sql`SELECT * FROM refund_requests WHERE id=${params.refundId}::uuid FOR UPDATE`);
    const refund = rows[0];
    if (!refund) throw new AppError("Refund request not found", 404);
    if (refund.status !== "requested") throw new AppError(`This refund is already ${refund.status}`, 409);
    if (refund.requested_by === params.approvedBy) throw new AppError("Segregation of duties: the person who requested a refund cannot approve it", 403);
    const source = await tx.transaction.findUniqueOrThrow({ where: { id: refund.source_transaction_id }, select: { loanId: true } });
    const transaction = await tx.transaction.create({
      data: {
        userId: refund.user_id, loanId: source.loanId, type: "customer_refund", amount: refund.amount, status: "pending",
        reference, provider: "marzpay", providerStatus: "initiating", reconciliationStatus: "unreconciled",
      },
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE refund_requests
      SET status='approved', approved_by=${params.approvedBy}::uuid, refund_transaction_id=${transaction.id}::uuid, decided_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=${refund.id}::uuid
    `);
    return { refund, transactionId: transaction.id };
  });

  const amount = normalizeMarzPayAmount(Number(claimed.refund.amount));
  const result = await sendMoney({ phone: claimed.refund.phone, amount, reference, description: `Kuula refund ${claimed.refund.id.slice(0, 8)}`, callbackUrl: buildMarzPayWebhookUrl() });
  if (result.outcome === "rejected") {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: claimed.transactionId },
        data: { status: "failed", providerStatus: `rejected${result.errorCode ? `:${result.errorCode}` : ""}`, providerPayload: result.raw as Prisma.InputJsonValue, reconciliationStatus: "reconciliation_required" },
      }),
      prisma.$executeRaw(Prisma.sql`UPDATE refund_requests SET status='failed', failure_reason=${result.message}, updated_at=CURRENT_TIMESTAMP WHERE id=${claimed.refund.id}::uuid`),
    ]);
    return { status: "failed", reference, message: `MarzPay refused the refund: ${result.message}` };
  }
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: claimed.transactionId },
      data: result.outcome === "unknown"
        ? { providerStatus: "unknown", providerPayload: result.raw as Prisma.InputJsonValue, reconciliationStatus: "awaiting_provider" }
        : { providerStatus: result.status || "processing", transactionId: result.uuid || null, providerFee: result.charge === null ? null : BigInt(result.charge), providerPayload: result.raw as Prisma.InputJsonValue },
    }),
    prisma.$executeRaw(Prisma.sql`UPDATE refund_requests SET status='sent', updated_at=CURRENT_TIMESTAMP WHERE id=${claimed.refund.id}::uuid`),
  ]);
  return {
    status: "sent",
    reference,
    message: result.outcome === "unknown"
      ? "Refund sent; MarzPay's answer was lost, so it is being confirmed and will not be sent again."
      : "Refund sent to MarzPay.",
  };
}

export async function cancelRefund(refundId: string): Promise<void> {
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE refund_requests SET status='cancelled', decided_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=${refundId}::uuid AND status='requested'
  `);
  if (updated !== 1) throw new AppError("Only a refund that has not been approved can be cancelled", 409);
}

export async function listRefunds() {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { amount: bigint }>>(Prisma.sql`
    SELECT r.id, r.user_id, u.full_name, r.phone, r.amount, r.reason, r.status, r.source_account, r.failure_reason,
           r.requested_by, r.approved_by, r.created_at, r.decided_at, t.reference AS refund_reference
    FROM refund_requests r
    JOIN users u ON u.id=r.user_id
    LEFT JOIN transactions t ON t.id=r.refund_transaction_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

/** Settlement hook: the account the refunded money was held in, and closes the request. */
export async function refundForTransaction(tx: Prisma.TransactionClient, transactionId: string): Promise<{ id: string; sourceAccount: RefundSourceAccount; userId: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; source_account: RefundSourceAccount; user_id: string }>>(Prisma.sql`
    SELECT id, source_account, user_id FROM refund_requests WHERE refund_transaction_id=${transactionId}::uuid LIMIT 1
  `);
  return rows[0] ? { id: rows[0].id, sourceAccount: rows[0].source_account, userId: rows[0].user_id } : null;
}
