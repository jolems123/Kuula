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
const TYPES = new Set<string>([...REQUIRED, "stock_equipment", "collateral_asset"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorizedApplication(id: string, userId: string, role: Parameters<typeof hasPermission>[0]) {
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

  // Required views remain single-image; stock and collateral accept up to eight.
  const normalized: { kind: string; dataUrl: string }[] = [];
  for (const [kind, value] of Object.entries(photos)) {
    const multi = kind === "stock_equipment" || kind === "collateral_asset";
    if (multi && Array.isArray(value)) {
      if (value.length > 8 || value.some(v => typeof v !== "string")) throw new AppError("Maximum eight photographs per optional category", 400);
      for (const dataUrl of value) normalized.push({kind,dataUrl});
    } else if (typeof value === "string") normalized.push({kind,dataUrl:value});
    else throw new AppError("Invalid photograph data", 400);
  }
  if (normalized.length > 19) throw new AppError("Too many photographs", 400);
  const hashes: string[] = [];
  for (const {dataUrl} of normalized) {
    let parsed: ReturnType<typeof parseDataUrl>;
    try { parsed = parseDataUrl(dataUrl); }
    catch { throw new AppError("All photos must be different JPG, PNG or WEBP images under 5MB", 400); }
    hashes.push(crypto.createHash("sha256").update(parsed.buffer).digest("hex"));
  }
  if (new Set(hashes).size !== hashes.length) throw new AppError("Each photograph must be different", 400);

  const saved: { kind: string; key: string; mime: string; bytes: number }[] = [];
  try {
    for (const {kind, dataUrl} of normalized) {
      const file = await saveFieldEvidence({ applicationId: id, evaluationId: id, evidenceType: "applicant-" + kind, dataUrl });
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


/** Credit staff must document collateral verification; a photo alone never confers a security interest. */
router.get("/applications/:id/collateral-assessment", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await authorizedApplication(id, req.user!.userId, req.user!.role);
  if (!hasPermission(req.user!.role, "loan.review")) throw new AppError("Staff credit review permission required",403);
  const rows = await prisma.$queryRaw<{id:string;asset_description:string;ownership_evidence:string;estimated_value:bigint;verification_status:string;inspection_notes:string;reviewed_at:Date;reviewed_by:string}[]>(Prisma.sql`
    SELECT id, asset_description, ownership_evidence, estimated_value, verification_status, inspection_notes, reviewed_at, reviewed_by
    FROM collateral_assessments WHERE application_id=${id}::uuid ORDER BY reviewed_at DESC LIMIT 1`);
  const photos = await prisma.$queryRaw<{id:string;photo_type:string}[]>(Prisma.sql`
    SELECT id,photo_type FROM business_application_photos WHERE application_id=${id}::uuid AND photo_type='collateral_asset'`);
  res.setHeader("Cache-Control","private, no-store");
  res.json({assessment: rows[0] ? {...rows[0],estimated_value:Number(rows[0].estimated_value)} : null, photos});
});

router.post("/applications/:id/collateral-assessment", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await authorizedApplication(id, req.user!.userId, req.user!.role);
  if (!hasPermission(req.user!.role, "loan.review")) throw new AppError("Staff credit review permission required",403);
  const description = typeof req.body?.assetDescription==="string" ? req.body.assetDescription.trim() : "";
  const ownership = typeof req.body?.ownershipEvidence==="string" ? req.body.ownershipEvidence.trim() : "";
  const notes = typeof req.body?.inspectionNotes==="string" ? req.body.inspectionNotes.trim() : "";
  const status = req.body?.verificationStatus;
  const value = req.body?.estimatedValue;
  if (description.length<10 || description.length>1000 || ownership.length<10 || ownership.length>1500 || notes.length<20 || notes.length>3000)
    throw new AppError("Asset, ownership findings, and inspection notes must be documented",400);
  if (!["pending","inspected","rejected"].includes(status)) throw new AppError("Invalid assessment decision",400);
  if (!Number.isSafeInteger(value) || value<0 || value>1000000000000) throw new AppError("Enter an integer UGX valuation",400);
  const photo = await prisma.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM business_application_photos WHERE application_id=${id}::uuid AND photo_type='collateral_asset' LIMIT 1`);
  if (status==="inspected" && !photo[0]) throw new AppError("An asset photograph is required before recording an inspection",409);
  const idNew=crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO collateral_assessments (id,application_id,reviewed_by,asset_description,ownership_evidence,estimated_value,verification_status,inspection_notes)
    VALUES (${idNew}::uuid,${id}::uuid,${req.user!.userId}::uuid,${description},${ownership},${BigInt(value)},${status},${notes})`);
  await writeAuditEvent({actorId:req.user!.userId,action:"loan.collateral_assessment_recorded",resourceType:"loan_application",resourceId:id,metadata:{assessmentId:idNew,status,photoPresent:Boolean(photo[0])}});
  res.status(201).json({ok:true,assessmentId:idNew,verificationStatus:status});
});

export default router;
