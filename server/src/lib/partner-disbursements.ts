import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import {
  providerLimit,
  splitDisbursementAmount,
  dispatchNextDisbursementLeg,
  disbursementBatchForApplication,
  type DisbursementNetwork,
  type DisbursementPlan,
} from "./disbursements.js";

interface DestinationRow {
  id: string;
  beneficiary_reference: string;
  network: DisbursementNetwork;
  max_single_amount: bigint;
  max_daily_amount: bigint | null;
}

async function committedToday(params: { marketCode: string; provider: string; network: string; reference: string; applicationId: string }): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ committed: bigint }>>(Prisma.sql`
    SELECT COALESCE(SUM(approved_amount),0)::bigint AS committed
    FROM disbursement_batches
    WHERE market_code=${params.marketCode}
      AND provider=${params.provider}
      AND network=${params.network}
      AND beneficiary_type='partner'
      AND beneficiary_reference=${params.reference}
      AND application_id <> ${params.applicationId}::uuid
      AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
      AND created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
      AND status IN ('planned','processing','partially_disbursed','settled','attention_required')
  `);
  return Number(rows[0]?.committed || 0);
}

export async function createVerifiedPartnerDisbursementBatch(params: {
  applicationId: string;
  userId: string;
  loanId: string;
  marketCode: string;
  amount: number;
  destinationProfileId: string;
  expectedReference: string;
  expectedNetwork: DisbursementNetwork;
}): Promise<DisbursementPlan> {
  const existing = await disbursementBatchForApplication(params.applicationId);
  if (existing) {
    return {
      batchId: existing.id,
      amount: existing.approvedAmount,
      network: existing.network,
      maxSingleAmount: Math.max(...existing.legs.map((leg) => leg.amount)),
      maxDailyAmount: null,
      legs: existing.legs.map((leg) => leg.amount),
    };
  }

  const destinations = await prisma.$queryRaw<DestinationRow[]>(Prisma.sql`
    SELECT id, beneficiary_reference, network, max_single_amount, max_daily_amount
    FROM payment_destination_profiles
    WHERE id=${params.destinationProfileId}::uuid
      AND market_code=${params.marketCode}
      AND provider='marzpay'
      AND beneficiary_type='partner'
      AND status='verified'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
  `);
  const destination = destinations[0];
  if (!destination) throw new AppError("Verified partner settlement destination is unavailable or expired", 409);
  if (destination.beneficiary_reference !== params.expectedReference || destination.network !== params.expectedNetwork) {
    throw new AppError("Partner settlement destination no longer matches the verified credit request", 409);
  }

  const limit = await providerLimit({
    marketCode: params.marketCode,
    provider: "marzpay",
    network: destination.network,
    beneficiaryType: "partner",
    beneficiaryReference: destination.beneficiary_reference,
  });
  const maxSingle = Number(limit.max_single_amount);
  const minAmount = Number(limit.min_amount);
  const maxDaily = limit.max_daily_amount === null ? null : Number(limit.max_daily_amount);
  const legs = splitDisbursementAmount(params.amount, maxSingle, minAmount);

  if (maxDaily !== null) {
    const alreadyCommitted = await committedToday({
      marketCode: params.marketCode,
      provider: "marzpay",
      network: destination.network,
      reference: destination.beneficiary_reference,
      applicationId: params.applicationId,
    });
    if (alreadyCommitted + params.amount > maxDaily) {
      throw new AppError("This partner settlement would exceed the verified daily limit for the destination account", 422);
    }
  }

  const batchId = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO disbursement_batches (
        id, application_id, user_id, loan_id, beneficiary_type, beneficiary_reference,
        market_code, provider, network, currency, approved_amount, total_planned, status
      ) VALUES (
        ${batchId}::uuid, ${params.applicationId}::uuid, ${params.userId}::uuid, ${params.loanId},
        'partner', ${destination.beneficiary_reference}, ${params.marketCode}, 'marzpay', ${destination.network}, 'UGX',
        ${BigInt(params.amount)}, ${BigInt(params.amount)}, 'planned'
      )
    `);
    for (let index = 0; index < legs.length; index += 1) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO disbursement_legs (id, batch_id, sequence, amount, status)
        VALUES (${crypto.randomUUID()}::uuid, ${batchId}::uuid, ${index + 1}, ${BigInt(legs[index])}, 'planned')
      `);
    }
  });

  return { batchId, amount: params.amount, network: destination.network, maxSingleAmount: maxSingle, maxDailyAmount: maxDaily, legs };
}

export { dispatchNextDisbursementLeg, disbursementBatchForApplication };
