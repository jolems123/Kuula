import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { accessFieldEvidence, deleteFieldEvidence, saveFieldEvidence } from "../lib/field-evidence-storage.js";
import { parseDataUrl } from "../lib/storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
const TYPES = new Set(["exterior", "interior", "applicant_at_business", "stock_equipment", "collateral_asset"]);
const REQUIRED_TYPES = new Set(["exterior", "interior", "applicant_at_business"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function draftPayload(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("Loan draft details are invalid", 400);
  const serialized = JSON.stringify(value);
  if (serialized.length > 100_000) throw new AppError("Loan draft is too large", 400);
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

router.get("/application-draft", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [draft, photos] = await Promise.all([
    prisma.$queryRaw<{ payload: unknown; updated_at: Date }[]>(Prisma.sql`SELECT payload, updated_at FROM loan_application_drafts WHERE applicant_id=${userId}::uuid LIMIT 1`),
    prisma.$queryRaw<{ id: string; photo_type: string; photo_order: number; mime: string; bytes: number; updated_at: Date }[]>(Prisma.sql`SELECT id, photo_type, photo_order, mime, bytes, updated_at FROM loan_application_draft_photos WHERE applicant_id=${userId}::uuid ORDER BY photo_type, photo_order`),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ draft: draft[0] ? { data: draft[0].payload, updatedAt: draft[0].updated_at } : null, photos: photos.map(photo => ({ id: photo.id, type: photo.photo_type, position: photo.photo_order, mime: photo.mime, bytes: photo.bytes, updatedAt: photo.updated_at })) });
});

router.put("/application-draft", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const payload = draftPayload(req.body?.draft);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO loan_application_drafts (applicant_id,payload,updated_at) VALUES (${userId}::uuid,${payload},now())
    ON CONFLICT (applicant_id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()`);
  res.json({ ok: true });
});

router.post("/application-draft/photos", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const type = String(req.body?.type || "");
  const position = Number(req.body?.position);
  const dataUrl = req.body?.dataUrl;
  if (!TYPES.has(type) || !Number.isInteger(position) || position < 0 || position > 7
    || (REQUIRED_TYPES.has(type) && position !== 0) || req.body?.photoConsent !== true || typeof dataUrl !== "string") {
    throw new AppError("Draft photo details are invalid", 400);
  }
  try { parseDataUrl(dataUrl); } catch { throw new AppError("Choose a valid JPG, PNG or WEBP image under 5 MB", 400); }
  const saved = await saveFieldEvidence({ applicationId: userId, evaluationId: "draft", evidenceType: `draft-${type}`, dataUrl });
  let oldKey: string | null = null;
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.$queryRaw<{ storage_key: string }[]>(Prisma.sql`SELECT storage_key FROM loan_application_draft_photos WHERE applicant_id=${userId}::uuid AND photo_type=${type} AND photo_order=${position} FOR UPDATE`);
      oldKey = current[0]?.storage_key ?? null;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO loan_application_draft_photos (id,applicant_id,photo_type,photo_order,storage_key,mime,bytes,consent_at,updated_at)
        VALUES (${crypto.randomUUID()}::uuid,${userId}::uuid,${type},${position},${saved.key},${saved.mime},${saved.bytes},now(),now())
        ON CONFLICT (applicant_id,photo_type,photo_order) DO UPDATE SET storage_key=EXCLUDED.storage_key,mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,consent_at=now(),updated_at=now()`);
    });
  } catch (error) { await deleteFieldEvidence(saved.key).catch(() => undefined); throw error; }
  if (oldKey && oldKey !== saved.key) await deleteFieldEvidence(oldKey).catch(() => undefined);
  await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "loan_draft.photo_saved", resourceType: "loan_application_draft", resourceId: userId, metadata: { type } });
  res.status(201).json({ ok: true, type });
});

router.get("/application-draft/photos/:photoId", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.photoId);
  if (!UUID.test(id)) throw new AppError("Invalid draft photo ID", 400);
  const rows = await prisma.$queryRaw<{ storage_key: string; mime: string }[]>(Prisma.sql`SELECT storage_key,mime FROM loan_application_draft_photos WHERE id=${id}::uuid AND applicant_id=${req.user!.userId}::uuid LIMIT 1`);
  if (!rows[0]) throw new AppError("Draft photo not found", 404);
  const asset = await accessFieldEvidence(rows[0].storage_key, rows[0].mime);
  res.setHeader("Cache-Control", "private, no-store");
  if (asset.kind === "buffer") { res.type(asset.mime).send(asset.buffer); return; }
  res.json({ url: asset.url, expiresInSeconds: asset.expiresInSeconds });
});

router.delete("/application-draft/photos/:type/:position", authenticateToken, async (req: Request, res: Response) => {
  const type = String(req.params.type);
  const position = Number(req.params.position);
  if (!TYPES.has(type) || !Number.isInteger(position) || position < 0 || position > 7
    || (REQUIRED_TYPES.has(type) && position !== 0)) throw new AppError("Invalid draft photo type or position", 400);
  const rows = await prisma.$queryRaw<{ storage_key: string }[]>(Prisma.sql`DELETE FROM loan_application_draft_photos WHERE applicant_id=${req.user!.userId}::uuid AND photo_type=${type} AND photo_order=${position} RETURNING storage_key`);
  if (rows[0]) await deleteFieldEvidence(rows[0].storage_key).catch(() => undefined);
  res.status(204).end();
});

router.delete("/application-draft", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const photos = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ storage_key: string }[]>(Prisma.sql`DELETE FROM loan_application_draft_photos WHERE applicant_id=${userId}::uuid RETURNING storage_key`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM loan_application_drafts WHERE applicant_id=${userId}::uuid`);
    return rows;
  });
  await Promise.allSettled(photos.map(photo => deleteFieldEvidence(photo.storage_key)));
  res.status(204).end();
});

export default router;
