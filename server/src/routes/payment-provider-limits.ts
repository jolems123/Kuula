import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("reconciliation.manage"));

const NETWORKS = new Set(["mtn", "airtel"]);
const BENEFICIARIES = new Set(["customer", "partner"]);
const MARZPAY_ADAPTER_MAX_UGX = 10_000_000;

function positiveMoney(value: unknown, label: string, optional = false): bigint | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(`${label} must be a positive amount`, 400);
  return BigInt(amount);
}

function validateNetwork(value: unknown): "mtn" | "airtel" {
  const network = String(value || "").trim().toLowerCase();
  if (!NETWORKS.has(network)) throw new AppError("Network must be MTN or Airtel", 400);
  return network as "mtn" | "airtel";
}

function validateBeneficiary(value: unknown): "customer" | "partner" {
  const beneficiaryType = String(value || "customer").trim().toLowerCase();
  if (!BENEFICIARIES.has(beneficiaryType)) throw new AppError("Beneficiary type must be customer or partner", 400);
  return beneficiaryType as "customer" | "partner";
}

router.get("/", async (_req: Request, res: Response) => {
  const [limits, destinations] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, market_code, provider, network, beneficiary_type, min_amount, max_single_amount,
             max_daily_amount, enabled, effective_from, effective_to, source_note, created_at, updated_at
      FROM payment_provider_limits
      ORDER BY market_code, provider, network, beneficiary_type, effective_from DESC
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, market_code, provider, network, beneficiary_type, beneficiary_reference, account_tier,
             max_single_amount, max_daily_amount, status, verified_at, expires_at, source_note, created_at, updated_at
      FROM payment_destination_profiles
      ORDER BY verified_at DESC
      LIMIT 500
    `),
  ]);
  res.json({
    limits: limits.map((row) => ({
      ...row,
      min_amount: Number(row.min_amount),
      max_single_amount: Number(row.max_single_amount),
      max_daily_amount: row.max_daily_amount == null ? null : Number(row.max_daily_amount),
    })),
    destinations: destinations.map((row) => ({
      ...row,
      beneficiary_reference: row.beneficiary_type === "customer"
        ? `${String(row.beneficiary_reference).slice(0, 7)}****${String(row.beneficiary_reference).slice(-2)}`
        : row.beneficiary_reference,
      max_single_amount: Number(row.max_single_amount),
      max_daily_amount: row.max_daily_amount == null ? null : Number(row.max_daily_amount),
    })),
  });
});

router.post("/", async (req: Request, res: Response) => {
  const marketCode = String(req.body?.marketCode || "UG").trim().toUpperCase().slice(0, 3);
  const provider = String(req.body?.provider || "marzpay").trim().toLowerCase().slice(0, 80);
  const network = validateNetwork(req.body?.network);
  const beneficiaryType = validateBeneficiary(req.body?.beneficiaryType);
  const sourceNote = String(req.body?.sourceNote || "").trim().slice(0, 1000);
  if (!sourceNote) throw new AppError("A source or operational note is required for provider limit changes", 400);

  const minAmount = positiveMoney(req.body?.minAmount ?? 500, "Minimum amount")!;
  const maxSingle = positiveMoney(req.body?.maxSingleAmount, "Maximum single transaction")!;
  const maxDaily = positiveMoney(req.body?.maxDailyAmount, "Maximum daily amount", true);
  if (maxSingle < minAmount) throw new AppError("Maximum single transaction must be at least the minimum amount", 400);
  if (maxDaily !== null && maxDaily < maxSingle) throw new AppError("Maximum daily amount cannot be below the single-transaction limit", 400);
  if (provider === "marzpay" && maxSingle > BigInt(MARZPAY_ADAPTER_MAX_UGX)) {
    throw new AppError(`MarZPay adapter currently supports at most UGX ${MARZPAY_ADAPTER_MAX_UGX.toLocaleString()} per API request`, 422);
  }

  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE payment_provider_limits
      SET enabled=false, effective_to=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE market_code=${marketCode} AND provider=${provider} AND network=${network}
        AND beneficiary_type=${beneficiaryType} AND enabled=true AND effective_to IS NULL
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO payment_provider_limits (
        id, market_code, provider, network, beneficiary_type, min_amount, max_single_amount,
        max_daily_amount, enabled, effective_from, source_note
      ) VALUES (
        ${id}::uuid, ${marketCode}, ${provider}, ${network}, ${beneficiaryType}, ${minAmount},
        ${maxSingle}, ${maxDaily}, true, CURRENT_TIMESTAMP, ${sourceNote}
      )
    `);
  });

  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "payment.provider_limit_changed",
    resourceType: "payment_provider_limit",
    resourceId: id,
    metadata: { marketCode, provider, network, beneficiaryType, minAmount: Number(minAmount), maxSingleAmount: Number(maxSingle), maxDailyAmount: maxDaily === null ? null : Number(maxDaily), sourceNote },
  });
  res.status(201).json({ ok: true, id });
});

router.post("/destinations", async (req: Request, res: Response) => {
  const marketCode = String(req.body?.marketCode || "UG").trim().toUpperCase().slice(0, 3);
  const provider = String(req.body?.provider || "marzpay").trim().toLowerCase().slice(0, 80);
  const network = validateNetwork(req.body?.network);
  const beneficiaryType = validateBeneficiary(req.body?.beneficiaryType);
  const rawReference = String(req.body?.beneficiaryReference || "").trim();
  if (!rawReference) throw new AppError("Beneficiary reference is required", 400);
  const beneficiaryReference = beneficiaryType === "customer" ? normalizeUgandaMobileMoneyPhone(rawReference) : rawReference.slice(0, 180);
  const accountTier = String(req.body?.accountTier || "").trim().slice(0, 120) || null;
  const sourceNote = String(req.body?.sourceNote || "").trim().slice(0, 1000);
  if (!sourceNote) throw new AppError("A verification/source note is required for destination limits", 400);
  const maxSingle = positiveMoney(req.body?.maxSingleAmount, "Destination maximum single transaction")!;
  const maxDaily = positiveMoney(req.body?.maxDailyAmount, "Destination maximum daily amount", true);
  if (maxDaily !== null && maxDaily < maxSingle) throw new AppError("Destination maximum daily amount cannot be below its single-transaction limit", 400);
  if (provider === "marzpay" && maxSingle > BigInt(MARZPAY_ADAPTER_MAX_UGX)) {
    throw new AppError(`Destination maximum exceeds the MarZPay adapter ceiling of UGX ${MARZPAY_ADAPTER_MAX_UGX.toLocaleString()}`, 422);
  }
  const expiresAt = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new AppError("Destination profile expiry is invalid", 400);
  if (expiresAt && expiresAt <= new Date()) throw new AppError("Destination profile expiry must be in the future", 400);

  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE payment_destination_profiles SET status='revoked', updated_at=CURRENT_TIMESTAMP
      WHERE market_code=${marketCode} AND provider=${provider} AND network=${network}
        AND beneficiary_type=${beneficiaryType} AND beneficiary_reference=${beneficiaryReference} AND status='verified'
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO payment_destination_profiles (
        id, market_code, provider, network, beneficiary_type, beneficiary_reference, account_tier,
        max_single_amount, max_daily_amount, status, verified_at, expires_at, source_note
      ) VALUES (
        ${id}::uuid, ${marketCode}, ${provider}, ${network}, ${beneficiaryType}, ${beneficiaryReference}, ${accountTier},
        ${maxSingle}, ${maxDaily}, 'verified', CURRENT_TIMESTAMP, ${expiresAt}, ${sourceNote}
      )
    `);
  });
  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "payment.destination_limit_verified",
    resourceType: "payment_destination_profile",
    resourceId: id,
    metadata: { marketCode, provider, network, beneficiaryType, beneficiaryMasked: beneficiaryType === "customer" ? `${beneficiaryReference.slice(0, 7)}****${beneficiaryReference.slice(-2)}` : beneficiaryReference, accountTier, maxSingleAmount: Number(maxSingle), maxDailyAmount: maxDaily === null ? null : Number(maxDaily), expiresAt: expiresAt?.toISOString() ?? null, sourceNote },
  });
  res.status(201).json({ ok: true, id });
});

router.post("/destinations/:id/revoke", async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  const note = String(req.body?.note || "").trim().slice(0, 1000);
  if (!note) throw new AppError("A revocation reason is required", 400);
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE payment_destination_profiles SET status='revoked', updated_at=CURRENT_TIMESTAMP
    WHERE id=${id}::uuid AND status='verified'
  `);
  if (!changed) throw new AppError("Verified destination profile not found", 404);
  await writeAuditEvent({ actorId: req.user!.userId, action: "payment.destination_limit_revoked", resourceType: "payment_destination_profile", resourceId: id, metadata: { note } });
  res.json({ ok: true });
});

export default router;
