import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, isStaffRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { parseDataUrl } from "../lib/storage.js";
import { accessFieldEvidence, deleteFieldEvidence, saveFieldEvidence } from "../lib/field-evidence-storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken);

router.put("/avatar", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  if (isStaffRole(req.user!.role)) throw new AppError("Customer profile photos only", 403);
  const photo = req.body?.image;
  if (typeof photo !== "string" || photo.length > 1_900_000) throw new AppError("Choose a cropped JPG photo under 1 MB", 400);
  let parsed: ReturnType<typeof parseDataUrl>;
  try { parsed = parseDataUrl(photo); } catch { throw new AppError("Invalid profile photo", 400); }
  if (parsed.mime !== "image/jpeg" || parsed.buffer.length > 1_000_000) throw new AppError("Cropped photo must be JPG under 1MB", 400);

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { avatarRef: true } });
  if (!existing) throw new AppError("Customer account not found", 404);
  const uploaded = await saveFieldEvidence({ applicationId: userId, evaluationId: userId, evidenceType: "customer-avatar", dataUrl: photo });
  try {
    const updated = await prisma.user.updateMany({
      where: { id: userId, avatarRef: existing.avatarRef },
      data: { avatarRef: uploaded.key },
    });
    if (updated.count !== 1) throw new AppError("Profile photo was updated in another session; please retry", 409);
  } catch (error) {
    await deleteFieldEvidence(uploaded.key).catch(() => undefined);
    throw error;
  }
  if (existing.avatarRef && existing.avatarRef !== uploaded.key
      && /^credit-evidence\\/[a-z0-9-]+\\/[a-z0-9-]+\\/[a-z0-9-]+-customer-avatar\\.jpg$/i.test(existing.avatarRef)) {
    await deleteFieldEvidence(existing.avatarRef).catch(() => console.warn("Old profile photo requires cleanup"));
  }
  await writeAuditEvent({ actorId: userId, subjectUserId: userId, action: "customer.avatar_updated", resourceType: "user", resourceId: userId }).catch(() => undefined);
  res.json({ ok: true });
});

router.get("/avatar", async (req: Request, res: Response) => {
  if (isStaffRole(req.user!.role)) throw new AppError("Customer profile photos only", 403);
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { avatarRef: true } });
  if (!user?.avatarRef) { res.status(404).json({ error: "No profile photo" }); return; }
  if (!/^credit-evidence\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+-customer-avatar\.jpg$/i.test(user.avatarRef)) throw new AppError("Invalid avatar record", 409);
  const result = await accessFieldEvidence(user.avatarRef, "image/jpeg");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.kind === "buffer") { res.type(result.mime).send(result.buffer); return; }
  // Proxy the short-lived S3 download through this authenticated endpoint so
  // mobile WebViews never need public bucket access or S3 browser CORS.
  const upstream = await fetch(result.url, { signal: AbortSignal.timeout(10000) });
  if (!upstream.ok) throw new AppError("Profile photo temporarily unavailable", 503);
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.length > 1_000_000) throw new AppError("Profile photo size is invalid", 409);
  res.type("image/jpeg").send(bytes);
});

export default router;
