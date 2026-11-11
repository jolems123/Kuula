import crypto from "node:crypto";
import { acceptedPaymentFees, PAYMENT_FEE_POLICY, COLLECTION_BPS, payoutQuote, payoutFee, type PaymentFeeDisclosure } from "./payment-fees.js";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import { guarantorCleared } from "./guarantor-policy.js";
import {
  buildMarzPayWebhookUrl,
  createPaymentReference,
  getMarzPayAccountWithdrawalLimits,
  getMarzPayAvailableBalanceUgx,
  lookupMarzPayTransaction,
  marzPayConfigured,
  marzPayLookupConfigured,
  normalizeMarzPayAmount,
  sendMoney,
  type MarzPayOutcome,
} from "./marzpay.js";

export type DisbursementNetwork = "mtn" | "airtel";
export type BeneficiaryType = "customer" | "partner";

interface ProviderLimitRow {
  min_amount: bigint;
  max_single_amount: bigint;
  max_daily_amount: bigint | null;
}

interface DestinationLimitRow {
  max_single_amount: bigint;
  max_daily_amount: bigint | null;
}

interface BatchRow {
  id: string;
  application_id: string;
  user_id: string;
  loan_id: string;
  beneficiary_type: BeneficiaryType;
  beneficiary_reference: string;
  market_code: string;
  provider: string;
  network: DisbursementNetwork;
  currency: string;
  approved_amount: bigint;
  total_planned: bigint;
  total_settled: bigint;
  status: string;
}

interface LegRow {
  id: string;
  batch_id: string;
  sequence: number;
  amount: bigint;
  customer_fee: bigint;
  status: string;
  transaction_id: string | null;
  reference: string | null;
  provider_status: string | null;
  provider_transaction_id: string | null;
}

export interface DisbursementPlan {
  batchId: string;
  amount: number;
  network: DisbursementNetwork;
  maxSingleAmount: number;
  maxDailyAmount: number | null;
  legs: number[];
}

export function networkFromChannel(channel: string): DisbursementNetwork {
  const normalized = String(channel || "").toLowerCase();
  if (normalized.includes("mtn")) return "mtn";
  if (normalized.includes("airtel")) return "airtel";
  throw new AppError("Select a supported Mobile Money network before disbursement", 422);
}

function nonProductionFallbackLimit(network: DisbursementNetwork): ProviderLimitRow | null {
  if (process.env.NODE_ENV === "production") return null;
  const variable = network === "mtn" ? "MTN_UG_MAX_SINGLE_DISBURSEMENT_UGX" : "AIRTEL_UG_MAX_SINGLE_DISBURSEMENT_UGX";
  const configured = Number(process.env[variable] || 5_000_000);
  const maxSingle = Number.isFinite(configured) && configured >= 500 ? Math.round(configured) : 5_000_000;
  return { min_amount: BigInt(500), max_single_amount: BigInt(maxSingle), max_daily_amount: null };
}

function lowerNullableLimit(first: bigint | null, second: bigint | null): bigint | null {
  if (first === null) return second;
  if (second === null) return first;
  return first < second ? first : second;
}

export async function providerLimit(params: {
  marketCode?: string;
  provider?: string;
  network: DisbursementNetwork;
  beneficiaryType: BeneficiaryType;
  beneficiaryReference?: string;
}): Promise<ProviderLimitRow> {
  const marketCode = params.marketCode || "UG";
  const provider = params.provider || "marzpay";
  const rows = await prisma.$queryRaw<ProviderLimitRow[]>(Prisma.sql`
    SELECT min_amount, max_single_amount, max_daily_amount
    FROM payment_provider_limits
    WHERE market_code = ${marketCode}
      AND provider = ${provider}
      AND network = ${params.network}
      AND beneficiary_type = ${params.beneficiaryType}
      AND enabled = true
      AND effective_from <= CURRENT_TIMESTAMP
      AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
    ORDER BY effective_from DESC
    LIMIT 1
  `);
  let general: ProviderLimitRow | null = rows[0] ?? nonProductionFallbackLimit(params.network);
  // For Uganda customer payouts, use current, authenticated MarzPay account limits
  // when Finance has not yet created a network-specific record. This is a
  // verified live account bound, not the public API ceiling or an invented cap.
  // A network record always takes precedence, and a read failure remains closed.
  if (!general && marketCode === "UG" && provider === "marzpay" &&
      params.beneficiaryType === "customer") {
    try {
      const verified = await getMarzPayAccountWithdrawalLimits();
      general = {
        min_amount: BigInt(verified.minimum),
        max_single_amount: BigInt(verified.maximum),
        max_daily_amount: null,
      };
    } catch {
      throw new AppError("MarzPay account withdrawal limits are unavailable; Finance must verify MTN/Airtel limits before the loan agreement can be accepted", 503);
    }
  }
  if (!general) throw new AppError(`No active ${params.network.toUpperCase()} disbursement limit is configured for ${marketCode}`, 503);

  if (!params.beneficiaryReference) return general;
  const destinations = await prisma.$queryRaw<DestinationLimitRow[]>(Prisma.sql`
    SELECT max_single_amount, max_daily_amount
    FROM payment_destination_profiles
    WHERE market_code=${marketCode}
      AND provider=${provider}
      AND network=${params.network}
      AND beneficiary_type=${params.beneficiaryType}
      AND beneficiary_reference=${params.beneficiaryReference}
      AND status='verified'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY verified_at DESC
    LIMIT 1
  `);
  const destination = destinations[0];
  if (!destination) return general;
  return {
    min_amount: general.min_amount,
    max_single_amount: general.max_single_amount < destination.max_single_amount ? general.max_single_amount : destination.max_single_amount,
    max_daily_amount: lowerNullableLimit(general.max_daily_amount, destination.max_daily_amount),
  };
}

export function splitDisbursementAmount(total: number, maxSingle: number, minAmount = 500): number[] {
  const amount = Math.round(Number(total));
  const maximum = Math.round(Number(maxSingle));
  const minimum = Math.round(Number(minAmount));
  if (!Number.isFinite(amount) || amount < minimum) throw new AppError("Approved amount is below the provider minimum", 422);
  if (!Number.isFinite(maximum) || maximum < minimum) throw new AppError("Provider disbursement limit is invalid", 503);
  if (amount <= maximum) return [amount];

  const legs: number[] = [];
  let remaining = amount;
  while (remaining > maximum) {
    legs.push(maximum);
    remaining -= maximum;
  }
  if (remaining > 0 && remaining < minimum && legs.length > 0) {
    const adjustment = minimum - remaining;
    if (legs[legs.length - 1] - adjustment < minimum) throw new AppError("Approved amount cannot be split within provider transaction limits", 422);
    legs[legs.length - 1] -= adjustment;
    remaining = minimum;
  }
  if (remaining > 0) legs.push(remaining);
  if (legs.some((leg) => leg < minimum || leg > maximum)) throw new AppError("Generated disbursement plan violates provider limits", 500);
  if (legs.reduce((sum, leg) => sum + leg, 0) !== amount) throw new AppError("Generated disbursement plan does not equal the approved amount", 500);
  return legs;
}

async function destinationCommittedToday(params: {
  marketCode: string;
  provider: string;
  network: DisbursementNetwork;
  beneficiaryReference: string;
  excludeApplicationId?: string;
}): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ committed: bigint }>>(Prisma.sql`
    SELECT COALESCE(SUM(b.approved_amount),0)::bigint AS committed
    FROM disbursement_batches b
    WHERE b.market_code=${params.marketCode}
      AND b.provider=${params.provider}
      AND b.network=${params.network}
      AND b.beneficiary_reference=${params.beneficiaryReference}
      AND b.created_at >= date_trunc('day', CURRENT_TIMESTAMP)
      AND b.created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
      AND b.status IN ('awaiting_release','planned','processing','partially_disbursed','settled','attention_required')
      ${params.excludeApplicationId ? Prisma.sql`AND b.application_id <> ${params.excludeApplicationId}::uuid` : Prisma.empty}
  `);
  return Number(rows[0]?.committed || 0);
}

export async function customerPaymentFeeDisclosure(params: { amount: number; phone: string; channel: string }): Promise<PaymentFeeDisclosure> {
  const network = networkFromChannel(params.channel);
  const limit = await providerLimit({ network, beneficiaryType: "customer", beneficiaryReference: params.phone });
  let quoted;
  try { quoted = payoutQuote(params.amount); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Payout fees unavailable", 422); }
  const netLegs = splitDisbursementAmount(quoted.net, Math.min(5_000_000, Number(limit.max_single_amount)), Number(limit.min_amount));
  let unallocatedFee = quoted.customerFee;
  const legs = netLegs.map((net, index) => {
    const customerFee = index === netLegs.length - 1 ? unallocatedFee : Math.floor(quoted.customerFee * net / quoted.net);
    unallocatedFee -= customerFee;
    return { budget: net + customerFee, net, customerFee };
  });
  return { policyVersion: PAYMENT_FEE_POLICY, principal: params.amount, payoutFee: quoted.customerFee, netDisbursement: quoted.net, collectionBps: COLLECTION_BPS, legs };
}

export async function createCustomerDisbursementBatch(params: {
  applicationId: string;
  userId: string;
  loanId: string;
  phone: string;
  amount: number;
  channel: string;
}): Promise<DisbursementPlan> {
  const existing = await prisma.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE application_id = ${params.applicationId}::uuid LIMIT 1`);
  if (existing[0]) {
    const legs = await prisma.$queryRaw<LegRow[]>(Prisma.sql`SELECT * FROM disbursement_legs WHERE batch_id = ${existing[0].id}::uuid ORDER BY sequence`);
    const effective = await providerLimit({ marketCode: existing[0].market_code, provider: existing[0].provider, network: existing[0].network, beneficiaryType: existing[0].beneficiary_type, beneficiaryReference: existing[0].beneficiary_reference });
    return {
      batchId: existing[0].id,
      amount: Number(existing[0].approved_amount),
      network: existing[0].network,
      maxSingleAmount: Number(effective.max_single_amount),
      maxDailyAmount: effective.max_daily_amount === null ? null : Number(effective.max_daily_amount),
      legs: legs.map((leg) => Number(leg.amount)),
    };
  }

  const network = networkFromChannel(params.channel);
  const limit = await providerLimit({ network, beneficiaryType: "customer", beneficiaryReference: params.phone });
  const maxSingle = Number(limit.max_single_amount);
  const minAmount = Number(limit.min_amount);
  const maxDaily = limit.max_daily_amount === null ? null : Number(limit.max_daily_amount);
  const acceptance = await prisma.loanAgreementAcceptance.findUnique({ where: { applicationId: params.applicationId } });
  const fees = acceptedPaymentFees(acceptance?.termsSnapshot);
  if (fees && fees.principal !== params.amount) throw new AppError("Accepted fee disclosure does not match the approved principal", 409);
  const legs = fees ? fees.legs.map(leg => leg.net) : splitDisbursementAmount(params.amount, maxSingle, minAmount);
  if (legs.some(amount => amount < minAmount || amount > maxSingle)) throw new AppError("Accepted payout plan exceeds current provider limits; a revised agreement is required", 409);
  const netTotal = legs.reduce((sum, amount) => sum + amount, 0);

  if (maxDaily !== null) {
    const alreadyCommitted = await destinationCommittedToday({ marketCode: "UG", provider: "marzpay", network, beneficiaryReference: params.phone, excludeApplicationId: params.applicationId });
    if (alreadyCommitted + params.amount > maxDaily) {
      throw new AppError(`This disbursement would exceed the verified daily ${network.toUpperCase()} limit for the destination account`, 422);
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
        'customer', ${params.phone}, 'UG', 'marzpay', ${network}, 'UGX',
        ${BigInt(params.amount)}, ${BigInt(netTotal)}, 'awaiting_release'
      )
    `);
    for (let index = 0; index < legs.length; index += 1) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO disbursement_legs (id, batch_id, sequence, amount, customer_fee, status)
        VALUES (${crypto.randomUUID()}::uuid, ${batchId}::uuid, ${index + 1}, ${BigInt(legs[index])}, ${BigInt(fees?.legs[index].customerFee ?? 0)}, 'planned')
      `);
    }
  });
  return { batchId, amount: params.amount, network, maxSingleAmount: maxSingle, maxDailyAmount: maxDaily, legs };
}

async function claimNextLeg(batchId: string): Promise<{ batch: BatchRow; leg: LegRow; transactionId: string; reference: string } | null> {
  return prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE id = ${batchId}::uuid FOR UPDATE`);
    const batch = batches[0];
    // Nothing is sent before an independent staff release, or once a batch is closed or held.
    if (!batch || ["awaiting_release", "settled", "attention_required", "cancelled"].includes(batch.status)) return null;

    const inflight = await tx.$queryRaw<LegRow[]>(Prisma.sql`
      SELECT * FROM disbursement_legs WHERE batch_id = ${batchId}::uuid AND status IN ('dispatching','pending') ORDER BY sequence LIMIT 1
    `);
    if (inflight[0]) return null;

    const planned = await tx.$queryRaw<LegRow[]>(Prisma.sql`
      SELECT * FROM disbursement_legs WHERE batch_id = ${batchId}::uuid AND status = 'planned' ORDER BY sequence LIMIT 1 FOR UPDATE
    `);
    const leg = planned[0];
    if (!leg) return null;

    const reference = createPaymentReference();
    const transaction = await tx.transaction.create({
      data: { userId: batch.user_id, loanId: batch.loan_id, type: "loan_disbursement_leg", amount: leg.amount, customerFee: leg.customer_fee, status: "pending", reference, provider: batch.provider, providerStatus: "initiating", reconciliationStatus: "unreconciled" },
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_legs SET status='dispatching', transaction_id=${transaction.id}::uuid, reference=${reference}, attempted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=${leg.id}::uuid AND status='planned'
    `);
    await tx.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status='processing', failure_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=${batchId}::uuid`);
    return { batch, leg, transactionId: transaction.id, reference };
  });
}

async function assertGuarantorReadyForBatch(batchId: string): Promise<void> {
  const batches = await prisma.$queryRaw<Array<{application_id:string}>>(Prisma.sql`SELECT application_id FROM disbursement_batches WHERE id=${batchId}::uuid LIMIT 1`);
  if(!batches[0]) throw new AppError("Disbursement batch not found",404);
  const guarantee = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:batches[0].application_id}});
  if(!guarantorCleared(guarantee?.status)) {
    throw new AppError("Payout blocked by incomplete guarantor agreement",409);
  }
}

export async function dispatchNextDisbursementLeg(batchId: string): Promise<{ dispatched: boolean; outcome?: MarzPayOutcome; reference?: string; sequence?: number; amount?: number; reason?: string }> {
  // Check before claiming, so a disabled switch never leaves a leg stuck in "dispatching".
  if (!marzPayConfigured()) return { dispatched: false, reason: "Real-money movement is disabled or MarzPay is not configured" };
  await assertGuarantorReadyForBatch(batchId);
  const claimed = await claimNextLeg(batchId);
  if (!claimed) return { dispatched: false, reason: "no-dispatchable-leg" };

  const amount = normalizeMarzPayAmount(Number(claimed.leg.amount));
  const result = await sendMoney({ phone: claimed.batch.beneficiary_reference, amount, reference: claimed.reference, description: `Kuula loan ${claimed.batch.loan_id} tranche ${claimed.leg.sequence}`, callbackUrl: buildMarzPayWebhookUrl() });
  const fee = result.charge === null ? null : BigInt(result.charge);

  if (result.outcome === "rejected") {
    // MarzPay definitely refused this reference, so no money moved and a retry is safe.
    const providerStatus = `rejected${result.errorCode ? `:${result.errorCode}` : ""}`;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id: claimed.transactionId }, data: { status: "failed", providerStatus, transactionId: result.uuid || null, providerPayload: result.raw as Prisma.InputJsonValue, reconciliationStatus: "reconciliation_required" } });
      await tx.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='failed', provider_transaction_id=${result.uuid || null}, provider_status=${providerStatus}, failure_reason=${result.message}, updated_at=CURRENT_TIMESTAMP WHERE id=${claimed.leg.id}::uuid`);
      await tx.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status=CASE WHEN total_settled > 0 THEN 'attention_required' ELSE 'failed' END, failure_reason=${result.message}, updated_at=CURRENT_TIMESTAMP WHERE id=${batchId}::uuid`);
    });
    return { dispatched: false, outcome: "rejected", reference: claimed.reference, sequence: claimed.leg.sequence, amount, reason: result.message };
  }

  if (result.outcome === "unknown") {
    // The payout may have gone through. Keep it pending so a late callback or a status
    // lookup can settle it, and never send another payment for this leg in the meantime.
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id: claimed.transactionId }, data: { providerStatus: "unknown", providerPayload: result.raw as Prisma.InputJsonValue, reconciliationStatus: "awaiting_provider" } });
      await tx.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='pending', provider_status='unknown', failure_reason=${result.message}, updated_at=CURRENT_TIMESTAMP WHERE id=${claimed.leg.id}::uuid`);
    });
    return { dispatched: true, outcome: "unknown", reference: claimed.reference, sequence: claimed.leg.sequence, amount, reason: result.message };
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id: claimed.transactionId }, data: { providerStatus: result.status || "processing", transactionId: result.uuid || null, providerFee: fee, providerPayload: result.raw as Prisma.InputJsonValue } });
    await tx.$executeRaw(Prisma.sql`UPDATE disbursement_legs SET status='pending', provider_transaction_id=${result.uuid || null}, provider_status=${result.status || "processing"}, updated_at=CURRENT_TIMESTAMP WHERE id=${claimed.leg.id}::uuid`);
  });
  return { dispatched: true, outcome: "accepted", reference: claimed.reference, sequence: claimed.leg.sequence, amount };
}

export async function disbursementBatchForApplication(applicationId: string) {
  const batches = await prisma.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE application_id=${applicationId}::uuid LIMIT 1`);
  const batch = batches[0];
  if (!batch) return null;
  const legs = await prisma.$queryRaw<LegRow[]>(Prisma.sql`SELECT * FROM disbursement_legs WHERE batch_id=${batch.id}::uuid ORDER BY sequence`);
  return {
    id: batch.id,
    status: batch.status,
    beneficiaryType: batch.beneficiary_type,
    network: batch.network,
    currency: batch.currency,
    approvedAmount: Number(batch.approved_amount),
    netDisbursement: Number(batch.total_planned),
    customerFee: Number(batch.approved_amount - batch.total_planned),
    totalSettled: Number(batch.total_settled),
    remainingAmount: Number(batch.total_planned - batch.total_settled),
    legs: legs.map((leg) => ({ id: leg.id, sequence: leg.sequence, amount: Number(leg.amount), customerFee: Number(leg.customer_fee), status: leg.status, reference: leg.reference })),
  };
}

/**
 * Before a failed leg may be sent again, MarzPay must confirm the earlier attempt did not
 * pay out. Accepted: MarzPay reports it failed or cancelled, or it cannot find a reference
 * that it had explicitly rejected at creation. Anything else blocks the retry.
 */
export async function assertLegSafeToRetry(leg: Pick<LegRow, "reference" | "provider_status" | "provider_transaction_id">): Promise<void> {
  if (!leg.reference) return;
  if (!marzPayLookupConfigured()) throw new AppError("MarzPay status lookup is not configured, so the earlier payout cannot be verified", 503);
  const lookup = await lookupMarzPayTransaction({ reference: leg.reference, uuid: leg.provider_transaction_id });
  if (lookup.state === "error") throw new AppError(`Could not verify the earlier payout with MarzPay: ${lookup.message}`, 503);
  if (lookup.state === "not_found") {
    if (String(leg.provider_status || "").startsWith("rejected")) return;
    throw new AppError("MarzPay has no record of the earlier payout yet. Reconcile it manually before any retry.", 409);
  }
  if (lookup.event.isFailure) return;
  throw new AppError(`MarzPay reports the earlier payout as "${lookup.event.status}". It must not be sent again.`, 409);
}

export async function resetFailedLegForRetry(batchId: string): Promise<void> {
  const candidates = await prisma.$queryRaw<LegRow[]>(Prisma.sql`
    SELECT * FROM disbursement_legs WHERE batch_id=${batchId}::uuid AND status='failed' ORDER BY sequence LIMIT 1
  `);
  if (!candidates[0]) throw new AppError("There is no provider-failed disbursement leg to retry", 409);
  await assertLegSafeToRetry(candidates[0]);

  await prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE id=${batchId}::uuid FOR UPDATE`);
    const batch = batches[0];
    if (!batch) throw new AppError("Disbursement batch not found", 404);
    if (batch.status === "settled") throw new AppError("Disbursement is already fully settled", 409);
    const failed = await tx.$queryRaw<LegRow[]>(Prisma.sql`
      SELECT * FROM disbursement_legs WHERE id=${candidates[0].id}::uuid AND status='failed' FOR UPDATE
    `);
    if (!failed[0] || failed[0].reference !== candidates[0].reference) throw new AppError("The disbursement leg changed while it was being verified; try again", 409);
    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_legs SET status='planned', transaction_id=NULL, reference=NULL, provider_transaction_id=NULL, provider_status=NULL, failure_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=${failed[0].id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE disbursement_batches SET status=CASE WHEN total_settled > 0 THEN 'partially_disbursed' ELSE 'planned' END, failure_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=${batchId}::uuid
    `);
  });
}

export interface ReleaseCandidate {
  batchId: string;
  applicationId: string;
  userId: string;
  applicantName: string;
  phone: string;
  network: string;
  amount: number;
  legs: number;
  createdAt: Date;
}

export async function batchesAwaitingRelease(): Promise<ReleaseCandidate[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; application_id: string; user_id: string; applicant_name: string; beneficiary_reference: string; network: string; approved_amount: bigint; legs: bigint; created_at: Date }>>(Prisma.sql`
    SELECT b.id, b.application_id, b.user_id, a.applicant_name, b.beneficiary_reference, b.network, b.approved_amount, b.created_at,
           (SELECT count(*) FROM disbursement_legs l WHERE l.batch_id=b.id) AS legs
    FROM disbursement_batches b JOIN loan_applications a ON a.id=b.application_id
    WHERE b.status='awaiting_release'
    ORDER BY b.created_at ASC
    LIMIT 200
  `);
  return rows.map((row) => ({
    batchId: row.id, applicationId: row.application_id, userId: row.user_id, applicantName: row.applicant_name,
    phone: row.beneficiary_reference, network: row.network, amount: Number(row.approved_amount), legs: Number(row.legs), createdAt: row.created_at,
  }));
}

/** Staff whose work on this loan disqualifies them from releasing its money. */
async function involvedStaff(applicationId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ id: string | null }>>(Prisma.sql`
    SELECT business_reviewed_by AS id FROM loan_applications WHERE id=${applicationId}::uuid
    UNION SELECT actor_id FROM approval_actions WHERE application_id=${applicationId}::uuid
    UNION SELECT assignee_id FROM approval_assignments WHERE application_id=${applicationId}::uuid
    UNION SELECT actor_id FROM audit_events
      WHERE resource_type='loan_application' AND resource_id=${applicationId}
        AND action IN ('loan.offer_created','loan.business_reviewed','credit.final_approval_recorded')
  `);
  return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
}

/**
 * Final authorization of an approved, customer-accepted payout. The releaser must not be
 * the borrower or anyone who reviewed, recommended or approved the loan, and MarzPay's
 * wallet must hold the full amount. The batch moves to `planned` atomically, so two
 * concurrent releases can never both proceed.
 */
export async function releaseDisbursementBatch(params: { applicationId: string; releasedBy: string }): Promise<{ batchId: string; amount: number }> {
  const requirement = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:params.applicationId}});
  if(!guarantorCleared(requirement?.status)) throw new AppError("Unresolved guarantor requirement",409);
  const batches = await prisma.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE application_id=${params.applicationId}::uuid LIMIT 1`);
  const batch = batches[0];
  if (!batch) throw new AppError("This loan has no payout waiting for release", 404);
  if (batch.status !== "awaiting_release") throw new AppError(`This payout is already ${batch.status.replaceAll("_", " ")}`, 409);
  if (!marzPayConfigured()) throw new AppError("Real-money movement is disabled, so payouts cannot be released", 503);
  await assertIndependentReleaser(params.applicationId, batch.user_id, params.releasedBy);

  const application = await prisma.loanApplication.findUnique({ where: { id: params.applicationId }, include: { applicant: true } });
  if (!application || application.status !== "disbursing") throw new AppError("The loan is no longer awaiting payout", 409);
  if (!application.applicant.kycVerified) throw new AppError("The borrower's identity is not verified", 422);
  if (application.businessProfile && application.businessReviewStatus !== "verified") throw new AppError("The borrower's business is not verified", 422);

  // Finance releases only the exact customer amount and payout schedule that
  // the borrower accepted. A modified application, batch or provider limit
  // requires a revised offer and fresh consent, not a silent payout.
  const signed = await prisma.loanAgreementAcceptance.findUnique({where:{applicationId:params.applicationId}});
  if (!signed || !signed.termsSnapshot || typeof signed.termsSnapshot !== "object" || Array.isArray(signed.termsSnapshot))
    throw new AppError("Verified loan agreement is required before disbursement release", 409);
  const terms = signed.termsSnapshot as Record<string, unknown>;
  if (Number(terms.principal) !== Number(application.amount) ||
      Number(terms.totalRepayment) !== Number(application.total) ||
      Number(terms.termDays) !== application.termDays ||
      Number(terms.apr) !== Number(application.apr) ||
      String(terms.disbursementChannel || "") !== application.channel ||
      Number(batch.approved_amount) !== Number(application.amount) ||
      batch.network !== networkFromChannel(application.channel)) {
    throw new AppError("The payout no longer matches the signed credit agreement; a revised offer and acceptance are required", 409);
  }
  const acceptedFees = acceptedPaymentFees(signed.termsSnapshot);
  if (!acceptedFees) throw new AppError("Accepted customer payout fees could not be verified", 409);
  const effective = await providerLimit({
    marketCode: batch.market_code, provider: batch.provider,
    network: batch.network, beneficiaryType: "customer",
    beneficiaryReference: batch.beneficiary_reference,
  });

  const balance = await getMarzPayAvailableBalanceUgx();
  if (balance === null) throw new AppError("MarzPay's wallet balance could not be read, so the payout cannot be funded safely", 503);
  const releaseLegs = await prisma.$queryRaw<LegRow[]>(Prisma.sql`SELECT * FROM disbursement_legs WHERE batch_id=${batch.id}::uuid ORDER BY sequence`);
  const expectedLegs = acceptedFees.legs;
  if (expectedLegs.length !== releaseLegs.length ||
      acceptedFees.principal !== Number(application.amount) ||
      acceptedFees.netDisbursement !== releaseLegs.reduce((sum, leg) => sum + Number(leg.amount), 0) ||
      releaseLegs.some((leg, index) =>
        Number(leg.amount) !== expectedLegs[index]?.net ||
        Number(leg.customer_fee) !== expectedLegs[index]?.customerFee ||
        Number(leg.amount) < Number(effective.min_amount) ||
        Number(leg.amount) > Number(effective.max_single_amount))) {
    throw new AppError("The signed payout plan no longer matches current limits or stored transfer legs", 409);
  }
  if (effective.max_daily_amount !== null) {
    const committed = await destinationCommittedToday({
      marketCode: batch.market_code, provider: batch.provider,
      network: batch.network, beneficiaryReference: batch.beneficiary_reference,
      excludeApplicationId: params.applicationId,
    });
    if (committed + Number(batch.approved_amount) > Number(effective.max_daily_amount))
      throw new AppError("This payout exceeds the verified recipient daily limit", 409);
  }
  let required;
  try { required = releaseLegs.reduce((sum, leg) => sum + Number(leg.amount) + payoutFee(Number(leg.amount)), 0); }
  catch { throw new AppError("Payout tariff is not verified for this batch; finance review is required", 409); }
  if (balance < required) {
    throw new AppError(`Insufficient MarzPay funds: UGX ${balance.toLocaleString()} available, UGX ${required.toLocaleString()} needed including provider charges`, 409);
  }

  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE disbursement_batches SET status='planned', released_by=${params.releasedBy}::uuid, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=${batch.id}::uuid AND status='awaiting_release'
  `);
  if (claimed !== 1) throw new AppError("This payout was released by someone else at the same time", 409);
  return { batchId: batch.id, amount: Number(batch.approved_amount) };
}

/** The borrower and anyone who reviewed, priced or approved the loan may not move its money. */
export async function assertIndependentReleaser(applicationId: string, borrowerId: string, staffId: string): Promise<void> {
  if (borrowerId === staffId) throw new AppError("Segregation of duties: a borrower cannot release their own payout", 403);
  if ((await involvedStaff(applicationId)).has(staffId)) {
    throw new AppError("Segregation of duties: someone who reviewed or approved this loan cannot also release its payout", 403);
  }
}

/** MarzPay's wallet must cover every leg still to be sent, plus the published tariff. */
export async function assertFundsForUnsentLegs(batchId: string): Promise<void> {
  const balance = await getMarzPayAvailableBalanceUgx();
  if (balance === null) throw new AppError("MarzPay's wallet balance could not be read, so the payout cannot be funded safely", 503);
  const legs = await prisma.$queryRaw<LegRow[]>(Prisma.sql`SELECT * FROM disbursement_legs WHERE batch_id=${batchId}::uuid AND status IN ('planned','failed') ORDER BY sequence`);
  let required;
  try { required = legs.reduce((sum, leg) => sum + Number(leg.amount) + payoutFee(Number(leg.amount)), 0); }
  catch { throw new AppError("Payout tariff is not verified for this batch; finance review is required", 409); }
  if (balance < required) throw new AppError(`Insufficient MarzPay funds: UGX ${balance.toLocaleString()} available, UGX ${required.toLocaleString()} needed including provider charges`, 409);
}

export interface AttentionPayout {
  batchId: string;
  applicationId: string;
  applicantName: string;
  phone: string;
  status: string;
  amount: number;
  totalSettled: number;
  failureReason: string | null;
  canRetry: boolean;
  canCancel: boolean;
  updatedAt: Date;
}

/** Released payouts that stopped: failed legs, or a hold that needs a person. */
export async function payoutsNeedingAttention(): Promise<AttentionPayout[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; application_id: string; applicant_name: string; beneficiary_reference: string; status: string; approved_amount: bigint; total_settled: bigint; failure_reason: string | null; updated_at: Date; failed_legs: bigint; open_legs: bigint; held_legs: bigint }>>(Prisma.sql`
    SELECT b.id, b.application_id, a.applicant_name, b.beneficiary_reference, b.status, b.approved_amount, b.total_settled, b.failure_reason, b.updated_at,
           (SELECT count(*) FROM disbursement_legs l WHERE l.batch_id=b.id AND l.status='failed') AS failed_legs,
           (SELECT count(*) FROM disbursement_legs l WHERE l.batch_id=b.id AND l.status IN ('dispatching','pending')) AS open_legs,
           (SELECT count(*) FROM disbursement_legs l WHERE l.batch_id=b.id AND l.status='attention_required') AS held_legs
    FROM disbursement_batches b JOIN loan_applications a ON a.id=b.application_id
    WHERE b.status IN ('failed','attention_required') AND a.status='disbursing'
    ORDER BY b.updated_at ASC
    LIMIT 200
  `);
  return rows.map((row) => ({
    batchId: row.id, applicationId: row.application_id, applicantName: row.applicant_name, phone: row.beneficiary_reference,
    status: row.status, amount: Number(row.approved_amount), totalSettled: Number(row.total_settled), failureReason: row.failure_reason,
    canRetry: Number(row.failed_legs) > 0 && Number(row.held_legs) === 0 && Number(row.open_legs) === 0,
    canCancel: Number(row.total_settled) === 0 && Number(row.open_legs) === 0 && Number(row.held_legs) === 0,
    updatedAt: row.updated_at,
  }));
}

/**
 * Closes a payout that never sent any money, so the customer is no longer blocked by a
 * loan stuck in `disbursing`. MarzPay must confirm every attempted leg failed first.
 */
export async function cancelUnpaidPayout(params: { applicationId: string; cancelledBy: string; reason: string }): Promise<void> {
  if (params.reason.trim().length < 20) throw new AppError("Record why the payout is being cancelled (at least 20 characters)", 400);
  const batches = await prisma.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE application_id=${params.applicationId}::uuid LIMIT 1`);
  const batch = batches[0];
  if (!batch) throw new AppError("This loan has no payout", 404);
  if (!["failed", "awaiting_release"].includes(batch.status)) throw new AppError("Only a payout that failed, or was never released, can be cancelled", 409);
  if (batch.total_settled > BigInt(0)) throw new AppError("Part of this payout was sent, so it cannot be cancelled", 409);
  const legs = await prisma.$queryRaw<LegRow[]>(Prisma.sql`SELECT * FROM disbursement_legs WHERE batch_id=${batch.id}::uuid ORDER BY sequence`);
  if (legs.some((leg) => !["planned", "failed"].includes(leg.status))) throw new AppError("A payout transfer is still in progress or held for review", 409);
  for (const leg of legs.filter((item) => item.status === "failed")) await assertLegSafeToRetry(leg);

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<BatchRow[]>(Prisma.sql`SELECT * FROM disbursement_batches WHERE id=${batch.id}::uuid FOR UPDATE`);
    if (!locked[0] || locked[0].status !== batch.status || locked[0].total_settled > BigInt(0)) throw new AppError("The payout changed while it was being cancelled; try again", 409);
    await tx.$executeRaw(Prisma.sql`UPDATE disbursement_batches SET status='cancelled', failure_reason=${params.reason.trim()}, updated_at=CURRENT_TIMESTAMP WHERE id=${batch.id}::uuid`);
    const changed = await tx.loanApplication.updateMany({
      where: { id: params.applicationId, status: "disbursing" },
      data: { status: "cancelled", decisionNotes: `Payout cancelled: ${params.reason.trim()}` },
    });
    if (changed.count !== 1) throw new AppError("The loan is no longer awaiting payout", 409);
  });
}
