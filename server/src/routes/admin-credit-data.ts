import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { evidenceExpiryDays } from "../lib/credit-evidence.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("credit_evidence.manage"));

router.get("/:userId", async (req: Request, res: Response) => {
  const rows = await prisma.creditEvidence.findMany({
    where: { userId: String(req.params.userId) },
    orderBy: { observedAt: "desc" },
    select: {
      id: true,
      sourceType: true,
      provider: true,
      externalReference: true,
      momoMonths: true,
      momoTxnCount: true,
      crbStatus: true,
      observedAt: true,
      expiresAt: true,
      status: true,
      verifiedBy: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  res.json({ evidence: rows });
});

// Manual evidence is staged first. It is deliberately NOT usable by the
// underwriting engine until a second authorized staff member approves it.
router.post("/:userId", async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const sourceType = String(req.body?.sourceType || "").trim().toLowerCase();
  const provider = String(req.body?.provider || "").trim().toLowerCase();
  const externalReference = String(req.body?.externalReference || "").trim();
  const sourceNote = String(req.body?.sourceNote || "").trim().slice(0, 1200);
  if (!["mobile_money", "crb"].includes(sourceType)) throw new AppError("sourceType must be mobile_money or crb", 400);
  if (!provider || !externalReference) throw new AppError("Provider and external reference are required", 400);
  if (sourceNote.length < 20) throw new AppError("A source verification note of at least 20 characters is required", 400);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("Customer not found", 404);

  const observedAt = req.body?.observedAt ? new Date(String(req.body.observedAt)) : new Date();
  if (Number.isNaN(observedAt.getTime()) || observedAt > new Date()) throw new AppError("observedAt is invalid", 400);
  const expiresAt = req.body?.expiresAt
    ? new Date(String(req.body.expiresAt))
    : new Date(observedAt.getTime() + evidenceExpiryDays(sourceType) * 86_400_000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= observedAt) throw new AppError("expiresAt must be after observedAt", 400);

  let momoMonths: number | null = null;
  let momoTxnCount: number | null = null;
  let crbStatus: string | null = null;
  if (sourceType === "mobile_money") {
    momoMonths = Math.round(Number(req.body?.momoMonths));
    momoTxnCount = Math.round(Number(req.body?.momoTxnCount));
    if (!Number.isFinite(momoMonths) || momoMonths < 0 || momoMonths > 120) throw new AppError("momoMonths is invalid", 400);
    if (!Number.isFinite(momoTxnCount) || momoTxnCount < 0 || momoTxnCount > 1_000_000) throw new AppError("momoTxnCount is invalid", 400);
  } else {
    crbStatus = String(req.body?.crbStatus || "").trim().toLowerCase();
    if (!["clean", "thin", "adverse"].includes(crbStatus)) throw new AppError("crbStatus must be clean, thin, or adverse", 400);
  }

  try {
    const evidence = await prisma.creditEvidence.create({
      data: {
        userId,
        sourceType,
        provider,
        externalReference,
        momoMonths,
        momoTxnCount,
        crbStatus,
        payload: {
          ...(req.body?.payload && typeof req.body.payload === "object" ? req.body.payload as Record<string, unknown> : {}),
          manualSubmission: true,
          submittedBy: req.user!.userId,
          sourceNote,
        } as Prisma.InputJsonValue,
        observedAt,
        expiresAt,
        status: "pending_review",
        verifiedBy: null,
      },
    });
    await writeAuditEvent({
      actorId: req.user!.userId,
      subjectUserId: userId,
      action: "credit_evidence.manual_submitted",
      resourceType: "credit_evidence",
      resourceId: evidence.id,
      metadata: { sourceType, provider, externalReference, expiresAt: expiresAt.toISOString(), sourceNote },
    });
    res.status(201).json({ evidence, requiresSecondApproval: true });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") throw new AppError("This provider reference is already recorded", 409);
    throw error;
  }
});

router.post("/:userId/:id/approve", async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const id = String(req.params.id);
  const note = String(req.body?.note || "").trim().slice(0, 1200);
  if (note.length < 20) throw new AppError("A second-review note of at least 20 characters is required", 400);

  const evidence = await prisma.creditEvidence.findFirst({ where: { id, userId } });
  if (!evidence) throw new AppError("Credit evidence not found", 404);
  if (evidence.status !== "pending_review") throw new AppError("Only pending manual evidence can be approved", 409);
  if (evidence.expiresAt <= new Date()) throw new AppError("This evidence has already expired", 409);

  const submitted = await prisma.auditEvent.findFirst({
    where: { resourceType: "credit_evidence", resourceId: id, action: "credit_evidence.manual_submitted" },
    orderBy: { createdAt: "asc" },
    select: { actorId: true },
  });
  if (!submitted?.actorId) throw new AppError("Original evidence submitter could not be verified", 409);
  if (submitted.actorId === req.user!.userId) {
    throw new AppError("A different authorized staff member must approve manually entered credit evidence", 403);
  }

  const updated = await prisma.creditEvidence.update({
    where: { id },
    data: { status: "verified", verifiedBy: req.user!.userId },
  });
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: userId,
    action: "credit_evidence.manual_approved",
    resourceType: "credit_evidence",
    resourceId: id,
    metadata: { submittedBy: submitted.actorId, reviewNote: note },
  });
  res.json({ evidence: updated });
});

router.post("/:userId/:id/revoke", async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const id = String(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  if (!reason) throw new AppError("A revocation reason is required", 400);
  const updated = await prisma.creditEvidence.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date(), status: "revoked" },
  });
  if (updated.count !== 1) throw new AppError("Active evidence not found", 404);
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: userId,
    action: "credit_evidence.revoked",
    resourceType: "credit_evidence",
    resourceId: id,
    metadata: { reason },
  });
  res.json({ ok: true });
});

export default router;
