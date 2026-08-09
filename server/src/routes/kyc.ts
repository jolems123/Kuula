import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { verifyNinWithSmileId } from "../lib/smile-id.js";
import { deleteKycDocument, saveKycImage } from "../lib/storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get("/status", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, fullName: true, nationalId: true, dateOfBirth: true, kycVerified: true, verified: true, updatedAt: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const latest = await prisma.kycSubmission.findFirst({
    where: { userId: user.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, submittedAt: true, reviewedAt: true, decisionReason: true },
  });

  res.json({
    kyc: {
      userId: user.id,
      fullName: user.fullName ?? "",
      nationalId: user.nationalId ?? "",
      dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? "",
      status: latest?.status ?? (user.kycVerified ? "verified" : "not_submitted"),
      verified: !!user.kycVerified,
      profileVerified: !!user.verified,
      submissionId: latest?.id ?? null,
      version: latest?.version ?? 0,
      submittedAt: latest?.submittedAt ?? null,
      reviewedAt: latest?.reviewedAt ?? null,
      decisionReason: latest?.status === "rejected" ? latest.decisionReason : null,
      updatedAt: user.updatedAt,
    },
  });
});

router.post("/submit", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const nationalId = normalizeNin(normalizeString(req.body?.nationalId));
  const fullName = normalizeString(req.body?.fullName);
  const dobRaw = normalizeString(req.body?.dob);
  const documentFront = normalizeString(req.body?.documentFront);
  const documentBack = normalizeString(req.body?.documentBack);

  if (!isValidUgandaNin(nationalId)) throw new AppError("A valid 14-character Uganda NIN is required", 400);
  if (!fullName || fullName.length < 2) throw new AppError("Valid full name is required", 400);
  const dobDate = parseDateOnly(dobRaw);
  if (!dobDate) throw new AppError("Valid date of birth is required (YYYY-MM-DD)", 400);
  if (!documentFront || !documentBack) throw new AppError("Both front and back ID images are required", 400);

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) throw new AppError("User not found", 404);
  if (existing.kycVerified) throw new AppError("Identity is already verified", 409);

  const duplicateNin = await prisma.user.findFirst({
    where: { nationalId, id: { not: userId }, deletedAt: null },
    select: { id: true },
  });
  if (duplicateNin) throw new AppError("This NIN is already linked to another account", 409);

  const latest = await prisma.kycSubmission.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
    select: { version: true, status: true },
  });
  if (latest?.status === "pending") throw new AppError("Your current KYC submission is still under review", 409);
  const nextVersion = (latest?.version ?? 0) + 1;

  let front: Awaited<ReturnType<typeof saveKycImage>> | null = null;
  let back: Awaited<ReturnType<typeof saveKycImage>> | null = null;
  try {
    front = await saveKycImage({ userId, side: "front", dataUrl: documentFront });
    back = await saveKycImage({ userId, side: "back", dataUrl: documentBack });
    const verification = await verifyNinWithSmileId({ nationalId, fullName, dob: dobRaw, userId });
    const status = verification.verified ? "verified" : "pending";

    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.kycSubmission.create({
        data: {
          userId,
          version: nextVersion,
          status,
          fullName,
          nationalId,
          dateOfBirth: dobDate,
          frontRef: front!.key,
          backRef: back!.key,
          frontMime: front!.mime,
          backMime: back!.mime,
          provider: verification.provider,
          providerReference: verification.reference ?? null,
          providerStatus: verification.status,
          providerDetail: verification.detail?.slice(0, 1000) ?? null,
          reviewedAt: verification.verified ? new Date() : null,
          decisionReason: verification.verified ? "Identity verified by configured identity provider" : null,
        },
      });

      await tx.kycAuditEvent.create({
        data: {
          submissionId: created.id,
          actorId: userId,
          action: "submitted",
          details: {
            provider: verification.provider,
            providerStatus: verification.status,
            autoVerified: verification.verified,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          fullName,
          nationalId,
          dateOfBirth: dobDate,
          kycVerified: verification.verified,
          verified: verification.verified ? true : existing.verified,
          kycDocFrontRef: front!.key,
          kycDocBackRef: back!.key,
          kycProvider: verification.provider,
          kycReference: verification.reference ?? null,
          kycSubmittedAt: new Date(),
        },
      });
      return created;
    });

    await writeAuditEvent({
      actorId: userId,
      subjectUserId: userId,
      action: "kyc.submitted",
      resourceType: "kyc_submission",
      resourceId: submission.id,
      metadata: { version: submission.version, status: submission.status },
    });

    res.json({
      ok: true,
      kyc: {
        submissionId: submission.id,
        version: submission.version,
        status: submission.status,
        verified: submission.status === "verified",
        documents: { front: "received", back: "received" },
        verificationProvider: submission.provider,
        verificationReference: submission.providerReference,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    await Promise.allSettled([
      ...(front ? [deleteKycDocument(front.key)] : []),
      ...(back ? [deleteKycDocument(back.key)] : []),
    ]);
    if (error instanceof AppError) throw error;
    if ((error as { code?: string })?.code === "P2002") {
      throw new AppError("This NIN or KYC version is already registered", 409);
    }
    throw new AppError(error instanceof Error ? error.message : "Could not submit KYC", 400);
  }
});

export default router;
