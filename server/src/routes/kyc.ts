import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

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
  const nationalId = normalizeString(req.body?.nationalId);
  const fullName = normalizeString(req.body?.fullName);
  const dobRaw = normalizeString(req.body?.dob);

  if (!nationalId || nationalId.length < 6) {
    throw new AppError("Valid national ID is required", 400);
  }
  if (!fullName || fullName.length < 2) {
    throw new AppError("Valid full name is required", 400);
  }
  const dobDate = parseDateOnly(dobRaw);
  if (!dobDate) {
    throw new AppError("Valid date of birth is required (YYYY-MM-DD)", 400);
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new AppError("User not found", 404);

  // NOTE: This marks KYC as submitted/pending review. Verification can be moved
  // to an external provider callback flow later.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      nationalId,
      kycVerified: false,
      verified: existing.verified,
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
      status: "pending",
      verified: !!updated.kycVerified,
      profileVerified: !!updated.verified,
      submittedDob: dobRaw,
      updatedAt: updated.updatedAt,
    },
  });
});

export default router;
