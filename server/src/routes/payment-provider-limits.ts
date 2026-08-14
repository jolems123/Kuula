import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("reconciliation.manage"));

const NETWORKS = new Set(["mtn", "airtel"]);
const BENEFICIARIES = new Set(["customer", "partner"]);

function positiveMoney(value: unknown, label: string, optional = false): bigint | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(`${label} must be a positive amount`, 400);
  return BigInt(amount);
}

router.get("/", async (_req: Request, res: Response) => {
  const limits = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, market_code, provider, network, beneficiary_type, min_amount, max_single_amount,
           max_daily_amount, enabled, effective_from, effective_to, source_note, created_at, updated_at
    FROM payment_provider_limits
    ORDER BY market_code, provider, network, beneficiary_type, effective_from DESC
  `);
  res.json({
    limits: limits.map((row) => ({
      ...row,
      min_amount: Number(row.min_amount),
      max_single_amount: Number(row.max_single_amount),
      max_daily_amount: row.max_daily_amount == null ? null : Number(row.max_daily_amount),
    })),
  });
});

router.post("/", async (req: Request, res: Response) => {
  const marketCode = String(req.body?.marketCode || "UG").trim().toUpperCase().slice(0, 3);
  const provider = String(req.body?.provider || "marzpay").trim().toLowerCase().slice(0, 80);
  const network = String(req.body?.network || "").trim().toLowerCase();
  const beneficiaryType = String(req.body?.beneficiaryType || "customer").trim().toLowerCase();
  const sourceNote = String(req.body?.sourceNote || "").trim().slice(0, 1000);
  if (!NETWORKS.has(network)) throw new AppError("Network must be MTN or Airtel", 400);
  if (!BENEFICIARIES.has(beneficiaryType)) throw new AppError("Beneficiary type must be customer or partner", 400);
  if (!sourceNote) throw new AppError("A source or operational note is required for provider limit changes", 400);

  const minAmount = positiveMoney(req.body?.minAmount ?? 500, "Minimum amount")!;
  const maxSingle = positiveMoney(req.body?.maxSingleAmount, "Maximum single transaction")!;
  const maxDaily = positiveMoney(req.body?.maxDailyAmount, "Maximum daily amount", true);
  if (maxSingle < minAmount) throw new AppError("Maximum single transaction must be at least the minimum amount", 400);
  if (maxDaily !== null && maxDaily < maxSingle) throw new AppError("Maximum daily amount cannot be below the single-transaction limit", 400);

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
    metadata: {
      marketCode,
      provider,
      network,
      beneficiaryType,
      minAmount: Number(minAmount),
      maxSingleAmount: Number(maxSingle),
      maxDailyAmount: maxDaily === null ? null : Number(maxDaily),
      sourceNote,
    },
  });
  res.status(201).json({ ok: true, id });
});

export default router;
