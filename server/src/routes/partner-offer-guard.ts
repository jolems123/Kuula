import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

router.post("/applications/decision", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  if (String(req.body?.decision || "") !== "approved") return next();
  const applicationId = String(req.body?.id || "").trim();
  if (!applicationId) return next();

  const request = await prisma.partnerFinancingRequest.findUnique({
    where: { loanApplicationId: applicationId },
  });
  if (!request) return next();

  const metadata = jsonObject(request.metadata);
  if (request.status !== "payee_verified" || metadata.invoiceVerified !== true || metadata.payeeVerified !== true) {
    throw new AppError("Partner invoice and settlement destination must be verified before creating a customer offer", 409);
  }
  if (!metadata.destinationProfileId || !metadata.settlementReference || !metadata.settlementNetwork) {
    throw new AppError("Verified partner settlement details are incomplete", 409);
  }

  const destination = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM payment_destination_profiles
    WHERE id=${String(metadata.destinationProfileId)}::uuid
      AND status='verified'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
  `);
  if (!destination[0]) throw new AppError("Partner settlement destination verification has expired or been revoked", 409);
  next();
});

export default router;
