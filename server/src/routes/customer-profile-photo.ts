import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, isStaffRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { saveFieldEvidence, accessFieldEvidence, deleteFieldEvidence } from "../lib/field-evidence-storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken);

type PhotoRecord = { storage_key: string; mime: string; bytes: number; updated_at: Date };
async function currentPhoto(userId: string): Promise<PhotoRecord | undefined> {
  const records = await prisma.$queryRaw<PhotoRecord[]>(Prisma.sql`
    SELECT storage_key, mime, bytes, updated_at
    FROM user_profile_photos WHERE user_id = ${userId}::uuid LIMIT 1
  `);
  return records[0];
}
function customer(req: Request): string {
  if (isStaffRole(req.user!.role)) throw new AppError("Only customer accounts can change a profile photo", 403);
  return req.user!.userId;
}

router.get("/photo", async (req: Request, res: Response) => {
  const userId = customer(req);
  const record = await currentPhoto(userId);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!record) { res.status(404).json({ error: "No profile photo uploaded" }); return; }
  const result = await accessFieldEvidence(record.storage_key, record.mime);
  if (result.kind === "url") {
    res.json({ url: result.url, expiresInSeconds: result.expiresInSeconds });
    return;
  }
  res.type(result.mime).send(result.buffer);
});

router.put("/photo", async (req: Request, res: Response) => {
  const userId = customer(req);
  const dataUrl = req.body?.photo;
  if (typeof dataUrl !== "string") throw new AppError("Select a valid profile photograph", 400);
  let saved: Awaited<ReturnType<typeof saveFieldEvidence>>;
  try {
    saved = await saveFieldEvidence({ applicationId: userId, evaluationId: userId, evidenceType: "customer-avatar", dataUrl });
  } catch (err) {
    if (err instanceof Error && /invalid|too large|image|base64|incomplete/i.test(err.message)) throw new AppError(err.message, 400);
    throw err;
  }
  let old: PhotoRecord | undefined;
  try {
    old = await prisma.$transaction(async tx => {
      const previous = await tx.$queryRaw<PhotoRecord[]>(Prisma.sql`
        SELECT storage_key, mime, bytes, updated_at FROM user_profile_photos
        WHERE user_id = ${userId}::uuid FOR UPDATE
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO user_profile_photos (user_id, storage_key, mime, bytes)
        VALUES (${userId}::uuid, ${saved.key}, ${saved.mime}, ${saved.bytes})
        ON CONFLICT (user_id) DO UPDATE
        SET storage_key=EXCLUDED.storage_key, mime=EXCLUDED.mime, bytes=EXCLUDED.bytes, updated_at=CURRENT_TIMESTAMP
      `);
      return previous[0];
    });
  } catch (error) {
    await deleteFieldEvidence(saved.key).catch(() => undefined);
    throw error;
  }
  if (old?.storage_key && old.storage_key !== saved.key) {
    await deleteFieldEvidence(old.storage_key).catch(() => console.warn("Old profile photo cleanup deferred"));
  }
  await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "customer.profile_photo_updated", resourceType: "user", resourceId: userId }).catch(() => undefined);
  res.json({ ok: true });
});

router.delete("/photo", async (req: Request, res: Response) => {
  const userId = customer(req);
  const previous = await currentPhoto(userId);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM user_profile_photos WHERE user_id = ${userId}::uuid`);
  if (previous) await deleteFieldEvidence(previous.storage_key).catch(() => console.warn("Old profile photo cleanup deferred"));
  await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "customer.profile_photo_removed", resourceType: "user", resourceId: userId }).catch(() => undefined);
  res.json({ ok: true });
});
export default router;
