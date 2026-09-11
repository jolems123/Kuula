/**
 * Admin → KYC review.
 *
 * `users.kyc_verified` is the single source of truth the customer app reads.
 * Approval sets it; rejection records a reason and leaves it false. ID images
 * are served only through this authenticated staff path.
 */
import { Router, Request, Response } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { audit } from "../../lib/audit.js";
import { parsePage, paged, queryStr, requireUuid, str, mapCustomer, mapAudit, withActorNames } from "./shared.js";

const router = Router();

const KYC_SELECT = {
  id: true, fullName: true, phone: true, email: true, nationalId: true, district: true, occupation: true,
  verified: true, phoneVerified: true, kycVerified: true, kycSubmittedAt: true, kycProvider: true, kycReference: true,
  kycReviewStatus: true, kycReviewNotes: true, kycReviewedAt: true, kycReviewedBy: true,
  kycDocFrontRef: true, kycDocBackRef: true, loansTotal: true, loansRepaid: true,
  deletedAt: true, createdAt: true, updatedAt: true,
} as const;

function kycWhere(status: string): Record<string, unknown> {
  const base = { role: "user" };
  switch (status) {
    case "pending":
      return { ...base, kycSubmittedAt: { not: null }, kycVerified: false, OR: [{ kycReviewStatus: null }, { kycReviewStatus: { not: "rejected" } }] };
    case "approved":
    case "verified":
      return { ...base, kycVerified: true };
    case "rejected":
      return { ...base, kycVerified: false, kycReviewStatus: "rejected" };
    case "not_submitted":
      return { ...base, kycSubmittedAt: null, kycVerified: false };
    case "all":
      return { ...base, kycSubmittedAt: { not: null } };
    default:
      throw new AppError("Unknown KYC status filter", 400);
  }
}

function mapKycRow(u: any) {
  return {
    ...mapCustomer(u),
    nationalId: u.nationalId ?? null,
    kycProvider: u.kycProvider ?? null,
    kycReference: u.kycReference ?? null,
    kycReviewStatus: u.kycReviewStatus ?? null,
    kycReviewNotes: u.kycReviewNotes ?? null,
    kycReviewedAt: u.kycReviewedAt ?? null,
    kycReviewedBy: u.kycReviewedBy ?? null,
    documents: { front: !!u.kycDocFrontRef, back: !!u.kycDocBackRef },
  };
}

// GET /api/admin/kyc/summary
router.get("/summary", async (_req: Request, res: Response) => {
  const [pending, approved, rejected, notSubmitted] = await Promise.all([
    prisma.user.count({ where: kycWhere("pending") }),
    prisma.user.count({ where: kycWhere("approved") }),
    prisma.user.count({ where: kycWhere("rejected") }),
    prisma.user.count({ where: kycWhere("not_submitted") }),
  ]);
  res.json({ pending, approved, rejected, notSubmitted });
});

// GET /api/admin/kyc?status=pending|approved|rejected|all
router.get("/", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const status = queryStr(req, "status") || "pending";
  const q = queryStr(req, "q");
  const where: any = kycWhere(status);
  if (q) {
    const search = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { nationalId: { contains: q, mode: "insensitive" } },
    ];
    // Combine with any OR already in the filter.
    where.AND = [...(where.OR ? [{ OR: where.OR }] : []), { OR: search }];
    delete where.OR;
  }

  const orderBy = status === "pending" ? { kycSubmittedAt: "asc" as const } : { kycReviewedAt: "desc" as const };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: KYC_SELECT, orderBy, skip: page.skip, take: page.take }),
    prisma.user.count({ where }),
  ]);

  res.json(paged(rows.map(mapKycRow), total, page));
});

// GET /api/admin/kyc/:userId
router.get("/:userId", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.userId), "customer id");
  const user = await prisma.user.findFirst({ where: { id, role: "user" }, select: KYC_SELECT });
  if (!user) throw new AppError("Customer not found", 404);

  const history = await prisma.auditEvent.findMany({
    where: { entityType: "user", entityId: id, action: { startsWith: "kyc." } },
    orderBy: { createdAt: "desc" },
  });
  const actors = await withActorNames(prisma, history);
  const reviewer = user.kycReviewedBy
    ? await prisma.user.findUnique({ where: { id: user.kycReviewedBy }, select: { fullName: true, email: true } })
    : null;

  res.json({
    kyc: { ...mapKycRow(user), reviewedByName: reviewer ? reviewer.fullName || reviewer.email : null },
    history: history.map((e) => mapAudit(e, actors.get(e.actorId ?? "") ?? null)),
  });
});

function storageRoot(): string {
  return path.resolve(process.env.KYC_STORAGE_DIR || "uploads/kyc");
}

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function readDocument(userId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  // Keys are `<userId>/<side>-<uuid>.<ext>`; refuse anything that escapes the
  // owner's folder even if the database row were tampered with.
  const normalized = path.posix.normalize(key);
  if (!normalized.startsWith(`${userId}/`) || normalized.includes("..")) return null;
  const abs = path.join(storageRoot(), ...normalized.split("/"));
  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return `data:${EXT_MIME[ext] ?? "application/octet-stream"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// GET /api/admin/kyc/:userId/documents — ID images as data URLs (staff only).
router.get("/:userId/documents", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.userId), "customer id");
  const user = await prisma.user.findFirst({
    where: { id, role: "user" },
    select: { kycDocFrontRef: true, kycDocBackRef: true },
  });
  if (!user) throw new AppError("Customer not found", 404);

  const [front, back] = await Promise.all([readDocument(id, user.kycDocFrontRef), readDocument(id, user.kycDocBackRef)]);

  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "kyc.documents_viewed", entityType: "user", entityId: id,
  });

  res.json({
    front, back,
    missing: {
      front: !!user.kycDocFrontRef && !front,
      back: !!user.kycDocBackRef && !back,
    },
  });
});

// POST /api/admin/kyc/:userId/approve
router.post("/:userId/approve", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.userId), "customer id");
  const notes = str(req.body?.notes);
  const user = await prisma.user.findFirst({ where: { id, role: "user" }, select: KYC_SELECT });
  if (!user) throw new AppError("Customer not found", 404);
  if (user.kycVerified) throw new AppError("This customer is already verified", 409);
  if (!user.kycSubmittedAt) throw new AppError("This customer has not submitted KYC yet", 409);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      kycVerified: true,
      verified: true,
      kycReviewStatus: "approved",
      kycReviewNotes: notes || null,
      kycReviewedAt: new Date(),
      kycReviewedBy: req.user!.userId,
    },
    select: KYC_SELECT,
  });

  await prisma.notification.create({
    data: {
      userId: id,
      title: "Identity verified",
      body: "Your identity documents have been verified. You can now apply for loans.",
      type: "success",
    },
  });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "kyc.approved", entityType: "user", entityId: id,
    metadata: { notes: notes || null, provider: user.kycProvider ?? null },
  });

  res.json({ ok: true, kyc: mapKycRow(updated) });
});

// POST /api/admin/kyc/:userId/reject
router.post("/:userId/reject", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.userId), "customer id");
  const notes = str(req.body?.notes);
  if (!notes) throw new AppError("A reason is required to reject KYC", 400);

  const user = await prisma.user.findFirst({ where: { id, role: "user" }, select: KYC_SELECT });
  if (!user) throw new AppError("Customer not found", 404);
  if (!user.kycSubmittedAt) throw new AppError("This customer has not submitted KYC yet", 409);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      kycVerified: false,
      kycReviewStatus: "rejected",
      kycReviewNotes: notes,
      kycReviewedAt: new Date(),
      kycReviewedBy: req.user!.userId,
    },
    select: KYC_SELECT,
  });

  await prisma.notification.create({
    data: {
      userId: id,
      title: "Identity verification unsuccessful",
      body: `We could not verify your identity documents: ${notes}. Please resubmit your ID in the app.`,
      type: "warning",
    },
  });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "kyc.rejected", entityType: "user", entityId: id,
    metadata: { notes, wasVerified: user.kycVerified },
  });

  res.json({ ok: true, kyc: mapKycRow(updated) });
});

export default router;
