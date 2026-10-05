import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import {
  mintDocumentVerificationToken,
  smileIdConfigured,
  verifyWebhookSignature,
  normalizeDocumentVerificationWebhook,
  webhookKuulaUserId,
  type DocumentVerificationWebhook,
} from "../lib/smile-id.js";
import { saveKycImage } from "../lib/storage.js";
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

/**
 * Start document-based KYC.
 *
 * The customer states their NIN, name, and birth date; the server opens a
 * pending submission and mints a short-lived Smile ID token. The hosted Smile
 * capture then photographs the national ID (front/back), a selfie, and a
 * liveness sequence. Smile ID authenticates the document, OCRs the printed
 * NIN, and matches the portrait against the live selfie; the verdict arrives
 * at /smile-webhook and settles the submission. The stated NIN must match the
 * NIN read from the document, so a customer cannot verify against a borrowed
 * number.
 */
router.post("/document-verification/start", authenticateToken, async (req: Request, res: Response) => {
  if (!smileIdConfigured()) throw new AppError("Identity verification is temporarily unavailable", 503);

  const userId = req.user!.userId;
  const nationalId = normalizeNin(normalizeString(req.body?.nationalId));
  const fullName = normalizeString(req.body?.fullName);
  const dobRaw = normalizeString(req.body?.dob);

  if (!isValidUgandaNin(nationalId)) throw new AppError("A valid 14-character Uganda NIN is required", 400);
  if (!fullName || fullName.length < 2) throw new AppError("Valid full name is required", 400);
  const dobDate = parseDateOnly(dobRaw);
  if (!dobDate) throw new AppError("Valid date of birth is required (YYYY-MM-DD)", 400);

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) throw new AppError("User not found", 404);
  if (existing.kycVerified) throw new AppError("Identity is already verified", 409);
  if (!existing.phone) throw new AppError("A verified phone number is required before identity verification", 422);

  const duplicateNin = await prisma.user.findFirst({
    where: { nationalId, id: { not: userId }, deletedAt: null },
    select: { id: true },
  });
  if (duplicateNin) throw new AppError("This NIN is already linked to another account", 409);

  const latest = await prisma.kycSubmission.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, providerReference: true, providerStatus: true },
  });
  // A capture that was started but never produced a verdict (cancelled, closed,
  // or failed to load) must not lock the customer out: restart it on the same
  // submission. Only a submission Smile ID has already answered stays in review.
  const resumable = latest?.status === "pending" && latest.providerStatus === "capture_started" ? latest : null;
  if (latest?.status === "pending" && !resumable) {
    throw new AppError("Your identity verification is already in progress. We will notify you when it completes.", 409);
  }
  const nextVersion = (latest?.version ?? 0) + 1;

  const jobId = `docv-${userId}-${Date.now()}`;
  let minted;
  try {
    minted = await mintDocumentVerificationToken({ userId, jobId, fullName, phone: existing.phone, nationalId });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Could not start identity verification", 502);
  }

  const submission = await prisma.$transaction(async (tx) => {
    if (resumable) {
      const restarted = await tx.kycSubmission.update({
        where: { id: resumable.id },
        data: { fullName, nationalId, dateOfBirth: dobDate, providerReference: jobId },
      });
      await tx.kycAuditEvent.create({
        data: {
          submissionId: restarted.id,
          actorId: userId,
          action: "capture_restarted",
          details: { provider: "smile-id", method: "document_verification" } as Prisma.InputJsonValue,
        },
      });
      return restarted;
    }
    const created = await tx.kycSubmission.create({
      data: {
        userId,
        version: nextVersion,
        status: "pending",
        fullName,
        nationalId,
        dateOfBirth: dobDate,
        // The document images are captured inside Smile ID's hosted flow and
        // pulled into Kuula storage when the verdict webhook arrives.
        frontRef: "smile:capture-pending",
        backRef: "smile:capture-pending",
        frontMime: "image/jpeg",
        backMime: "image/jpeg",
        provider: "smile-id",
        providerReference: jobId,
        providerStatus: "capture_started",
      },
    });
    await tx.kycAuditEvent.create({
      data: {
        submissionId: created.id,
        actorId: userId,
        action: "submitted",
        details: { provider: "smile-id", method: "document_verification" } as Prisma.InputJsonValue,
      },
    });
    return created;
  });

  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "kyc.document_verification_started",
    resourceType: "kyc_submission",
    resourceId: submission.id,
    metadata: { version: submission.version },
  });

  res.json({
    ok: true,
    verification: {
      submissionId: submission.id,
      jobId,
      token: minted.token,
      environment: minted.environment,
      callbackUrl: minted.callbackUrl,
      partnerId: minted.partnerId,
      privacyPolicyUrl: minted.privacyPolicyUrl,
    },
  });
});

/** Persist a Smile-hosted image into Kuula KYC storage. Best-effort. */
async function persistHostedImage(userId: string, side: "front" | "back", url: string | undefined) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!/^image\/(jpeg|png)$/.test(mime)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null;
    return await saveKycImage({ userId, side, dataUrl: `data:${mime};base64,${buffer.toString("base64")}` });
  } catch {
    return null;
  }
}

/**
 * Smile ID delivers the document-verification verdict here. Authenticity is
 * the HMAC signature over the Response-Timestamp header; delivery may be
 * replayed, so settling is idempotent.
 */
router.post("/smile-webhook", async (req: Request, res: Response) => {
  const timestamp = String(req.headers["response-timestamp"] ?? "");
  const signature = String(req.headers["response-signature"] ?? "");
  if (!verifyWebhookSignature(timestamp, signature)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const payload = req.body as DocumentVerificationWebhook;
  if (payload.product && !["document_verification", "doc_verification"].includes(payload.product)) {
    res.json({ ok: true });
    return;
  }
  const normalized = normalizeDocumentVerificationWebhook(payload);
  const jobId = normalized.jobId;
  const kuulaUserId = webhookKuulaUserId(payload);
  if (!jobId && !kuulaUserId) {
    res.status(400).json({ error: "Missing job reference" });
    return;
  }

  let submission = jobId
    ? await prisma.kycSubmission.findFirst({ where: { providerReference: jobId, provider: "smile-id" } })
    : null;
  if (!submission && kuulaUserId) {
    // Smile ID reported its own job id instead of ours: settle the customer's
    // open capture, identified by the user id bound into the token.
    submission = await prisma.kycSubmission.findFirst({
      where: { userId: kuulaUserId, provider: "smile-id", status: "pending", providerStatus: "capture_started" },
      orderBy: { version: "desc" },
    });
  }
  if (!submission) {
    // Unknown job — acknowledge so Smile ID does not keep retrying.
    console.warn(JSON.stringify({ event: "kyc.smile_webhook_unmatched", status: normalized.status, hasJobReference: Boolean(jobId), hasUserReference: Boolean(kuulaUserId) }));
    res.json({ ok: true });
    return;
  }
  if (submission.status !== "pending") {
    res.json({ ok: true });
    return;
  }
  if (submission.providerStatus === normalized.status) {
    // Smile ID retries callbacks. A repeated pending/manual-review verdict must
    // not duplicate audit entries or repeat document persistence.
    res.json({ ok: true });
    return;
  }

  // Best-effort: move the document images into Kuula storage for staff review.
  const front = await persistHostedImage(submission.userId, "front", payload.image_links?.id_card_image);
  const back = await persistHostedImage(submission.userId, "back", payload.image_links?.id_card_back_image);

  const status = normalized.status;
  const documentNin = normalizeNin(payload.id_fields?.id_number ?? "");
  const ninMatches = status === "clear" && documentNin === submission.nationalId;

  let nextStatus: string;
  let decisionReason: string | null;
  if (status === "clear" && ninMatches) {
    nextStatus = "verified";
    decisionReason = "Document authenticated and matched by Smile ID";
  } else if (status === "clear" && !ninMatches) {
    nextStatus = "rejected";
    decisionReason = "The NIN on the document does not match the NIN on this account";
  } else if (status === "attention") {
    // Readable document with a reviewable condition — staff decide.
    nextStatus = "pending";
    decisionReason = null;
  } else {
    nextStatus = "rejected";
    decisionReason = normalized.message.slice(0, 500);
  }

  const providerDetail = JSON.stringify({
    message: payload.message ?? null,
    reason: payload.reason ?? null,
    receipt: payload.kyc_receipt ?? null,
    documentType: payload.id_fields?.id_type ?? null,
    documentNin: payload.id_fields?.id_number ?? null,
  }).slice(0, 1000);

  await prisma.$transaction(async (tx) => {
    await tx.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: nextStatus,
        providerStatus: status,
        providerDetail,
        ...(front ? { frontRef: front.key, frontMime: front.mime } : {}),
        ...(back ? { backRef: back.key, backMime: back.mime } : {}),
        ...(nextStatus !== "pending" ? { reviewedAt: new Date(), decisionReason } : {}),
      },
    });
    await tx.kycAuditEvent.create({
      data: {
        submissionId: submission.id,
        action: "provider_verdict",
        details: {
          provider: "smile-id",
          status,
          reason: payload.reason ?? null,
          ninMatches,
          imagesPersisted: { front: !!front, back: !!back },
        } as Prisma.InputJsonValue,
      },
    });
    if (nextStatus === "verified") {
      const documentDob = parseDateOnly(payload.id_fields?.date_of_birth ?? "");
      await tx.user.update({
        where: { id: submission.userId },
        data: {
          kycVerified: true,
          verified: true,
          kycProvider: "smile-id",
          kycReference: jobId,
          kycSubmittedAt: new Date(),
          ...(front ? { kycDocFrontRef: front.key } : {}),
          ...(back ? { kycDocBackRef: back.key } : {}),
          ...(documentDob ? { dateOfBirth: documentDob } : {}),
        },
      });
    }
  });

  await writeAuditEvent({
    subjectUserId: submission.userId,
    action: `kyc.document_verification_${nextStatus}`,
    resourceType: "kyc_submission",
    resourceId: submission.id,
    metadata: { providerStatus: status, reason: payload.reason ?? null },
  });

  res.json({ ok: true });
});

export default router;
