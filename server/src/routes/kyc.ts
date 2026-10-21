import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { verifyWebhookSignature, normalizeDocumentVerificationWebhook, webhookKuulaUserId, type DocumentVerificationWebhook } from "../lib/smile-id.js";
import { deleteKycDocument, parseDataUrl, saveKycImage } from "../lib/storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
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
    select: { id: true, version: true, status: true, provider: true, submittedAt: true, reviewedAt: true, decisionReason: true },
  });

  res.set("Cache-Control", "private, no-store").json({
    kyc: {
      userId: user.id,
      fullName: user.fullName ?? "",
      nationalId: user.nationalId ?? "",
      dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? "",
      status: latest?.status ?? (user.kycVerified ? "verified" : "not_submitted"),
      verified: !!user.kycVerified,
      loanEligible: !!user.kycVerified && latest?.status === "verified",
      profileVerified: !!user.verified,
      submissionId: latest?.id ?? null,
      version: latest?.version ?? 0,
      submittedAt: latest?.submittedAt ?? null,
      reviewedAt: latest?.reviewedAt ?? null,
      method: latest?.provider ?? null,
      decisionReason: latest?.status === "rejected" ? latest.decisionReason : null,
      updatedAt: user.updatedAt,
    },
  });
});

/**
 * Direct customer KYC capture. This is NOT identity verification by upload.
 * The national ID (both sides) and portrait are private, unverified evidence
 * reviewed by authorized KYC staff. Existing Smile submissions remain in history.
 */
router.post("/submit-documents", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const fullName = normalizeString(req.body?.fullName);
  const nationalId = normalizeNin(normalizeString(req.body?.nationalId));
  const dateOfBirth = parseDateOnly(normalizeString(req.body?.dob));
  if (fullName.length < 2 || fullName.length > 120) throw new AppError("Enter the legal name printed on your ID", 400);
  if (!isValidUgandaNin(nationalId)) throw new AppError("Enter a valid 14-character Uganda NIN", 400);
  if (!dateOfBirth) throw new AppError("Enter a valid date of birth", 400);
  const today = new Date();
  const adultCutoff = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  if (dateOfBirth > adultCutoff || dateOfBirth.getUTCFullYear() < 1900) throw new AppError("Kuula requires an applicant aged 18 or over", 422);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AppError("Account not found", 404);
  if (!user.phoneVerified) throw new AppError("Verify your phone number first", 403);
  if (user.kycVerified) throw new AppError("Identity is already verified", 409);
  if (user.nationalId && user.nationalId !== nationalId) throw new AppError("The NIN must match the one you registered", 422);
  const duplicate = await prisma.user.findFirst({ where: { nationalId, id: { not: userId }, deletedAt: null }, select: { id: true } });
  if (duplicate) throw new AppError("This NIN is already associated with an account", 409);

  if (req.body?.photoConsent !== true) throw new AppError("Agree to identity photograph processing before submitting", 400);
  const data = {
    front: req.body?.frontImage,
    back: req.body?.backImage,
    portrait: req.body?.portraitImage,
  };
  // Validate all three before persisting any file. Never echo images into logs/errors.
  const parsed = new Map<string, Buffer>();
  for (const [side, value] of Object.entries(data)) {
    if (typeof value !== "string") throw new AppError("Capture the ID front, ID back and portrait image", 400);
    try { parsed.set(side, parseDataUrl(value).buffer); }
    catch { throw new AppError("The " + side + " image must be a valid JPG, PNG or WEBP under 5 MB", 400); }
  }
  if (parsed.get("front")!.equals(parsed.get("back")!) ||
      parsed.get("front")!.equals(parsed.get("portrait")!) ||
      parsed.get("back")!.equals(parsed.get("portrait")!))
    throw new AppError("Upload three different photos: ID front, ID back and your portrait", 400);
  const latest = await prisma.kycSubmission.findFirst({ where: { userId }, orderBy: { version: "desc" }, select: { version: true, status: true, provider: true } });
  if (latest?.status === "pending" && latest.provider !== "smile-id")
    throw new AppError("Your identity documents are awaiting staff review", 409);

  const saved: string[] = [];
  try {
    const front = await saveKycImage({ userId, side: "front", dataUrl: data.front as string }); saved.push(front.key);
    const back = await saveKycImage({ userId, side: "back", dataUrl: data.back as string }); saved.push(back.key);
    const portrait = await saveKycImage({ userId, side: "portrait", dataUrl: data.portrait as string }); saved.push(portrait.key);
    const submission = await prisma.$transaction(async tx => {
      // Protect against concurrent submissions for the same borrower.
      const current = await tx.kycSubmission.findFirst({ where: { userId }, orderBy: { version: "desc" },
        select: { id: true, version: true, status: true, provider: true } });
      if (current?.status === "pending" && current.provider !== "smile-id")
        throw new AppError("Your identity documents are awaiting staff review", 409);
      if (current?.status === "pending" && current.provider === "smile-id") {
        await tx.kycSubmission.updateMany({
          where: { id: current.id, status: "pending", provider: "smile-id" },
          data: { status: "rejected", providerStatus: "superseded_by_manual_capture",
            reviewedAt: new Date(), decisionReason: "Legacy capture replaced with Kuula document upload" },
        });
        await tx.kycAuditEvent.create({ data: { submissionId: current.id, actorId: userId,
          action: "legacy_capture_superseded", details: { method: "manual" } as Prisma.InputJsonValue } });
      }
      const record = await tx.kycSubmission.create({
        data: {
          userId, version: (current?.version ?? 0) + 1, status: "pending",
          fullName, nationalId, dateOfBirth,
          frontRef: front.key, frontMime: front.mime,
          backRef: back.key, backMime: back.mime,
          portraitRef: portrait.key, portraitMime: portrait.mime,
          provider: "kuula-manual", providerStatus: "manual_review",
        },
      });
      await tx.kycAuditEvent.create({ data: {
        submissionId: record.id, actorId: userId, action: "documents_submitted",
        details: { method: "manual", items: ["front", "back", "portrait"], photoConsent: true } as Prisma.InputJsonValue,
      } });
      await tx.user.update({ where: { id: userId }, data: {
        kycSubmittedAt: new Date(), kycProvider: "kuula-manual", kycReference: record.id,
      } });
      return record;
    });
    // The authoritative submission audit is committed inside the transaction.
    // Failure to emit a secondary generic event must not orphan persisted evidence.
    await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "kyc.manual_submitted",
      resourceType: "kyc_submission", resourceId: submission.id, metadata: { version: submission.version } })
      .catch(() => console.warn("KYC secondary audit unavailable; submission audit remains committed"));
    res.status(201).json({ ok: true, kyc: { submissionId: submission.id, status: "pending", version: submission.version } });
  } catch (error) {
    await Promise.allSettled(saved.map(key => deleteKycDocument(key)));
    throw error;
  }
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
router.post("/document-verification/start", authenticateToken, async (_req: Request, _res: Response) => {
  throw new AppError("Smile ID capture has been retired. Upload ID front, back and portrait instead.", 410);
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
    const claim = await tx.kycSubmission.updateMany({
      where: { id: submission.id, status: "pending", provider: "smile-id" },
      data: {
        status: nextStatus,
        providerStatus: status,
        providerDetail,
        ...(front ? { frontRef: front.key, frontMime: front.mime } : {}),
        ...(back ? { backRef: back.key, backMime: back.mime } : {}),
        ...(nextStatus !== "pending" ? { reviewedAt: new Date(), decisionReason } : {}),
      },
    });
    if (claim.count === 0) return; // customer may have superseded this old capture
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
