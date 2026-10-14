import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { parseDataUrl } from "../lib/storage.js";
import { saveFieldEvidence, deleteFieldEvidence, accessFieldEvidence } from "../lib/field-evidence-storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
const REQUIRED = ["exterior", "interior", "applicant_at_business"] as const;
const TYPES = new Set<string>([...REQUIRED, "stock_equipment"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorizedApplication(id: string, userId: string, role: string) {
  if (!UUID.test(id)) throw new AppError("Invalid application ID", 400);
  const application = await prisma.loanApplication.findUnique({ where: { id }, select: { id: true, applicantId: true, status: true } });
  if (!application) throw new AppError("Application not found", 404);
  if (application.applicantId !== userId && !hasPermission(role, "loan.review")) throw new AppError("Application not found", 404);
  return application;
}

router.post("/applications/:id/business-photos", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const userId = req.user!.userId;
  const app = await authorizedApplication(id, userId, req.user!.role);
  if (app.applicantId !== userId) throw new AppError("Only the applicant may submit business photographs", 403);
  if (!["pending", "resubmitted"].includes(app.status)) throw new AppError("Photographs cannot be changed after review advances", 409);
  if (req.body?.photoConsent !== true) throw new AppError("Consent to business photo review is required", 400);
  const photos = req.body?.photos;
  if (!photos || typeof photos !== "object" || Array.isArray(photos) || Object.keys(photos).some(k => !TYPES.has(k)))
    throw new AppError("Unsupported business photo fields", 400);
  if (REQUIRED.some(k => typeof photos[k] !== "string"))
    throw new AppError("Business exterior, interior and applicant-at-business photos are required", 400);

  // Validate all image signatures and sizes BEFORE creating any private file.
  const parsed = new Map<string, ReturnType<typeof parseDataUrl>>();
  for (const [kind, dataUrl] of Object.entries(photos)) {
    if (typeof dataUrl !== "string") throw new AppError("Invalid photo", 400);
    try { parsed.set(kind, parseDataUrl(dataUrl)); }
    catch { throw new AppError("All photos must be distinct JPG, PNG or WEBP images under 5MB", 400); }
  }
  const hashes = [...parsed.values()].map(p => crypto.createHash("sha256").update(p.buffer).digest("hex"));
  if (new Set(hashes).size !== hashes.length) throw new AppError("Provide different photos for each required view", 400);

  const saved: { kind: string; key: string; mime: string; bytes: number }[] = [];
  try {
    for (const [kind] of parsed) {
      const file = await saveFieldEvidence({ applicationId: id, evaluationId: id, evidenceType: "applicant-" + kind, dataUrl: photos[kind] });
      saved.push({ kind, ...file });
    }
    // Fail on existing photo metadata rather than overwriting evidence that may already have been reviewed.
    await prisma.$transaction(async tx => {
      const current = await tx.loanApplication.findUnique({ where: { id }, select: { applicantId: true, status: true } });
      if (!current || current.applicantId !== userId || !["pending", "resubmitted"].includes(current.status))
        throw new AppError("Application state changed; retry from the application screen", 409);
      const existing = await tx.$queryRaw<{ photo_type: string }[]>(Prisma.sql`SELECT photo_type FROM business_application_photos WHERE application_id = ${id}::uuid FOR UPDATE`);
      if (existing.length) throw new AppError("Business photos have already been submitted for this application", 409);
      for (const photo of saved) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO business_application_photos
          (id, application_id, uploaded_by, photo_type, storage_key, mime, bytes, captured_at, consent_at)
          VALUES (${crypto.randomUUID()}::uuid, ${id}::uuid, ${userId}::uuid, ${photo.kind}, ${photo.key}, ${photo.mime}, ${photo.bytes}, now(), now())`);
      }
    });
    await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "business_photos.submitted", resourceType: "loan_application", resourceId: id, metadata: { kinds: saved.map(x => x.kind), consent: true } }).catch(() => console.warn("Secondary business-photo audit unavailable; persisted evidence remains intact"));
    res.status(201).json({ ok: true, applicationId: id, photoTypes: saved.map(x => x.kind), reviewStatus: "pending" });
  } catch (error) {
    await Promise.allSettled(saved.map(file => deleteFieldEvidence(file.key)));
    throw error;
  }
});

router.get("/applications/:id/business-photos", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await authorizedApplication(id, req.user!.userId, req.user!.role);
  const records = await prisma.$queryRaw<{id: string; photo_type: string; mime: string; bytes: number; created_at: Date}[]>(Prisma.sql`
    SELECT id, photo_type, mime, bytes, created_at FROM business_application_photos WHERE application_id = ${id}::uuid ORDER BY created_at`);
  res.json({ photos: records.map(r => ({ id: r.id, type: r.photo_type, mime: r.mime, bytes: r.bytes, uploadedAt: r.created_at })) });
});

router.get("/applications/:id/business-photos/:photoId", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id), photoId = String(req.params.photoId);
  if (!UUID.test(photoId)) throw new AppError("Invalid photo ID", 400);
  await authorizedApplication(id, req.user!.userId, req.user!.role);
  const found = await prisma.$queryRaw<{ storage_key: string; mime: string }[]>(Prisma.sql`
    SELECT storage_key, mime FROM business_application_photos WHERE id = ${photoId}::uuid AND application_id = ${id}::uuid LIMIT 1`);
  if (!found[0]) throw new AppError("Photo not found", 404);
  const evidence = await accessFieldEvidence(found[0].storage_key, found[0].mime);
  res.setHeader("Cache-Control", "private, no-store");
  if (evidence.kind === "buffer") { res.type(evidence.mime).send(evidence.buffer); return; }
  // Signed URL is short-lived, but must never be returned to unauthorized callers.
  res.json({ url: evidence.url, expiresInSeconds: evidence.expiresInSeconds });
});

export default router;
