import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { accessKycDocument } from "../lib/storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken);

router.get("/queue", requirePermissions("kyc.review"), async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const take = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const submissions = await prisma.kycSubmission.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { submittedAt: "asc" },
    take,
    select: {
      id: true,
      userId: true,
      version: true,
      status: true,
      fullName: true,
      nationalId: true,
      dateOfBirth: true,
      provider: true,
      providerReference: true,
      providerStatus: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      decisionReason: true,
    },
  });
  res.json({ submissions });
});

router.post("/:id/decision", requirePermissions("kyc.review"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const decision = String(req.body?.decision || "").toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  if (!['verified', 'rejected'].includes(decision)) throw new AppError("Decision must be verified or rejected", 400);
  if (!reason) throw new AppError("A written decision reason is required", 400);

  const current = await prisma.kycSubmission.findUnique({ where: { id } });
  if (!current) throw new AppError("KYC submission not found", 404);
  if (current.status !== "pending") throw new AppError("Only pending KYC submissions can be reviewed", 409);

  const latest = await prisma.kycSubmission.findFirst({ where: { userId: current.userId }, orderBy: { version: "desc" } });
  if (!latest || latest.id !== current.id) throw new AppError("Only the latest KYC submission can be reviewed", 409);

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.kycSubmission.update({
      where: { id },
      data: {
        status: decision,
        reviewedAt: new Date(),
        reviewedBy: req.user!.userId,
        decisionReason: reason,
      },
    });
    await tx.user.update({
      where: { id: current.userId },
      data: {
        kycVerified: decision === "verified",
        verified: decision === "verified",
        nationalId: current.nationalId,
        dateOfBirth: current.dateOfBirth,
      },
    });
    await tx.kycAuditEvent.create({
      data: {
        submissionId: id,
        actorId: req.user!.userId,
        action: decision === "verified" ? "approved" : "rejected",
        details: { reason } as Prisma.InputJsonValue,
      },
    });
    return submission;
  });

  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: current.userId,
    action: `kyc.${decision}`,
    resourceType: "kyc_submission",
    resourceId: id,
    metadata: { reason },
  });
  res.json({ ok: true, submission: result });
});

router.get("/:id/document/:side", requirePermissions("kyc.document.view"), async (req: Request, res: Response) => {
  const side = String(req.params.side);
  if (side !== "front" && side !== "back") throw new AppError("Document side must be front or back", 400);
  const submission = await prisma.kycSubmission.findUnique({ where: { id: String(req.params.id) } });
  if (!submission) throw new AppError("KYC submission not found", 404);

  const key = side === "front" ? submission.frontRef : submission.backRef;
  const mime = side === "front" ? submission.frontMime : submission.backMime;
  const access = await accessKycDocument(key, mime);
  await prisma.kycAuditEvent.create({
    data: {
      submissionId: submission.id,
      actorId: req.user!.userId,
      action: "document_viewed",
      details: { side } as Prisma.InputJsonValue,
    },
  });
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: submission.userId,
    action: "kyc.document_viewed",
    resourceType: "kyc_submission",
    resourceId: submission.id,
    metadata: { side },
  });

  res.setHeader("Cache-Control", "private, no-store");
  if (access.kind === "url") {
    res.redirect(302, access.url);
    return;
  }
  res.type(access.mime).send(access.buffer);
});

router.get("/:id/audit", requirePermissions("kyc.review"), async (req: Request, res: Response) => {
  const submission = await prisma.kycSubmission.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!submission) throw new AppError("KYC submission not found", 404);
  const events = await prisma.kycAuditEvent.findMany({
    where: { submissionId: submission.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ events });
});

export default router;
