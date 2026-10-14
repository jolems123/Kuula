import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, isStaffRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { saveAvatar, accessAvatar, deleteAvatar } from "../lib/customer-avatar-storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken);
router.get("/me/photo", async (req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<Array<{ storage_key: string; mime: string }>>(Prisma.sql`
    SELECT storage_key, mime FROM customer_profile_photos WHERE user_id=${req.user!.userId}::uuid LIMIT 1
  `);
  if (!rows[0]) { res.status(404).json({ error: "No profile photograph uploaded" }); return; }
  const file = await accessAvatar(rows[0].storage_key, rows[0].mime);
  res.setHeader("Cache-Control", "private, no-store");
  if (file.kind === "url") { res.json({ url: file.url, expiresInSeconds: 60 }); return; }
  res.type(file.mime).send(file.buffer);
});
router.put("/me/photo", async (req: Request, res: Response) => {
  if (isStaffRole(req.user!.role)) throw new AppError("Only customer profiles support this photo", 403);
  const photo = req.body?.photo;
  if (typeof photo !== "string" || photo.length > 7_500_000) throw new AppError("Photo is required, 5MB maximum", 400);
  let stored: Awaited<ReturnType<typeof saveAvatar>>;
  try { stored = await saveAvatar(req.user!.userId, photo); }
  catch (e) { throw new AppError(e instanceof Error ? e.message : "Invalid profile photo", 422); }
  let previous: string | null = null;
  try {
    await prisma.$transaction(async tx => {
      const old = await tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT storage_key FROM customer_profile_photos WHERE user_id=${req.user!.userId}::uuid FOR UPDATE
      `);
      previous = old[0]?.storage_key ?? null;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO customer_profile_photos (user_id, storage_key, mime, bytes, uploaded_at)
        VALUES (${req.user!.userId}::uuid, ${stored.key}, ${stored.mime}, ${stored.bytes}, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET storage_key=EXCLUDED.storage_key, mime=EXCLUDED.mime,
          bytes=EXCLUDED.bytes, uploaded_at=CURRENT_TIMESTAMP
      `);
    });
  } catch (error) {
    await deleteAvatar(stored.key).catch(() => undefined);
    throw error;
  }
  if (previous) await deleteAvatar(previous).catch(() => console.warn("Previous avatar cleanup pending"));
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: req.user!.userId,
    action: "customer.avatar_updated", resourceType: "user", resourceId: req.user!.userId })
    .catch(() => console.warn("Profile photo audit delivery failed"));
  res.json({ ok: true, photoUpdated: true });
});
router.delete("/me/photo", async (req: Request, res: Response) => {
  const old = await prisma.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
    DELETE FROM customer_profile_photos WHERE user_id=${req.user!.userId}::uuid RETURNING storage_key
  `);
  if (old[0]) await deleteAvatar(old[0].storage_key).catch(() => console.warn("Avatar cleanup pending"));
  res.json({ ok: true });
});
export default router;
