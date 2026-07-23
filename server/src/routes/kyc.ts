import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { verifyNinWithSmileId } from "../lib/smile-id.js";
import { saveKycImage } from "../lib/storage.js";

const router = Router();

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/kyc/status
router.get("/status", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      kycVerified: true,
      verified: true,
      updatedAt: true,
    },
  });

  if (!user) throw new AppError("User not found", 404);

  res.json({
    kyc: {
      userId: user.id,
      fullName: user.fullName ?? "",
      nationalId: user.nationalId ?? "",
      status: user.kycVerified ? "verified" : "pending",
      verified: !!user.kycVerified,
      profileVerified: !!user.verified,
      updatedAt: user.updatedAt,
    },
  });
});

// POST /api/kyc/submit
router.post("/submit", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const nationalId = normalizeNin(normalizeString(req.body?.nationalId));
  const fullName = normalizeString(req.body?.fullName);
  const dobRaw = normalizeString(req.body?.dob);
  const documentFront = normalizeString(req.body?.documentFront);
  const documentBack = normalizeString(req.body?.documentBack);

  if (!isValidUgandaNin(nationalId)) {
    throw new AppError("A valid 14-character Uganda NIN is required", 400);
  }
  if (!fullName || fullName.length < 2) {
    throw new AppError("Valid full name is required", 400);
  }
  const dobDate = parseDateOnly(dobRaw);
  if (!dobDate) {
    throw new AppError("Valid date of birth is required (YYYY-MM-DD)", 400);
  }
  if (!documentFront || !documentBack) {
    throw new AppError("Both front and back ID images are required", 400);
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new AppError("User not found", 404);

  // Persist the actual ID images to storage; parseDataUrl enforces type/size
  // server-side (defence in depth over the client-side checks).
  let frontRef: string;
  let backRef: string;
  try {
    frontRef = (await saveKycImage({ userId, side: "front", dataUrl: documentFront })).key;
    backRef = (await saveKycImage({ userId, side: "back", dataUrl: documentBack })).key;
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Could not store ID images", 400);
  }

  // Best-effort identity check against NIRA via Smile ID. Fail-safe: when the
  // provider is unconfigured or unavailable this resolves to "pending" and the
  // record is queued for manual review rather than blocking the user.
  const verification = await verifyNinWithSmileId({ nationalId, fullName, dob: dobRaw, userId });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      nationalId,
      kycVerified: verification.verified,
      verified: existing.verified,
      kycDocFrontRef: frontRef,
      kycDocBackRef: backRef,
      kycProvider: verification.provider,
      kycReference: verification.reference ?? null,
      kycSubmittedAt: new Date(),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      kycVerified: true,
      verified: true,
      updatedAt: true,
    },
  });

  res.json({
    ok: true,
    kyc: {
      userId: updated.id,
      fullName: updated.fullName ?? "",
      nationalId: updated.nationalId ?? "",
      status: verification.verified ? "verified" : "pending",
      verified: !!updated.kycVerified,
      profileVerified: !!updated.verified,
      submittedDob: dobRaw,
      documentFrontRef: frontRef,
      documentBackRef: backRef,
      verificationProvider: verification.provider,
      verificationReference: verification.reference ?? null,
      updatedAt: updated.updatedAt,
    },
  });
});

export default router;
