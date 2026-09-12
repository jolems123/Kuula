import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticateToken,
  INVITABLE_STAFF_ROLES,
  isStaffRole,
  requirePermissions,
} from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import { issueOtpForUser } from "../lib/otp-service.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

// Every endpoint in this router is Super Admin only. Invitable roles exclude
// super_admin itself: a second super admin can only be created by seeding,
// never through an invite, so staff.manage cannot be used to clone itself.
router.use(authenticateToken, requirePermissions("staff.manage"));

function normalizedPhone(value: unknown): string {
  try {
    return normalizeUgandaMobileMoneyPhone(String(value ?? ""));
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid phone number", 400);
  }
}

const STAFF_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  role: true,
  phoneVerified: true,
  createdAt: true,
  deletedAt: true,
} as const;

router.get("/", async (_req: Request, res: Response) => {
  const staff = await prisma.user.findMany({
    where: { role: { notIn: ["user", "customer"] } },
    select: STAFF_SELECT,
    orderBy: { createdAt: "asc" },
  });
  res.json({
    staff: staff.map((member) => ({
      ...member,
      status: member.deletedAt
        ? "deactivated"
        : member.phoneVerified
          ? "active"
          : "invited",
    })),
  });
});

router.post("/invite", async (req: Request, res: Response) => {
  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const phone = normalizedPhone(req.body.phone);
  const role = typeof req.body.role === "string" ? req.body.role.trim().toLowerCase() : "";

  if (fullName.length < 2 || fullName.length > 120) throw new AppError("Enter the staff member's full name", 400);
  if (!(INVITABLE_STAFF_ROLES as readonly string[]).includes(role)) {
    throw new AppError(`Role must be one of: ${INVITABLE_STAFF_ROLES.join(", ")}`, 400);
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && !existing.deletedAt) {
    if (isStaffRole(existing.role) && !existing.passwordHash && !existing.phoneVerified) {
      // Pending invitation for this number — resend the activation code.
      await issueOtpForUser(existing, "staff_invite");
      await writeAuditEvent({
        actorId: req.user!.userId,
        subjectUserId: existing.id,
        action: "staff.invite_resent",
        resourceType: "user",
        resourceId: existing.id,
      });
      res.json({ ok: true, staffId: existing.id, status: "invited" });
      return;
    }
    throw new AppError("That phone number already belongs to an account", 409);
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      phone,
      role,
      phoneVerified: false,
      passwordHash: null,
    },
  });
  await issueOtpForUser(user, "staff_invite");

  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: user.id,
    action: "staff.invited",
    resourceType: "user",
    resourceId: user.id,
    metadata: { role },
  });

  const created = await prisma.user.findUnique({ where: { id: user.id }, select: STAFF_SELECT });
  res.status(201).json({ ok: true, staff: { ...created!, status: "invited" } });
});

router.post("/:id/deactivate", async (req: Request, res: Response) => {
  const targetId = String(req.params.id ?? "");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt || !isStaffRole(target.role)) throw new AppError("Staff account not found", 404);
  if (target.id === req.user!.userId) throw new AppError("You cannot deactivate your own account", 400);
  if (target.role === "super_admin") throw new AppError("The Super Admin account cannot be deactivated", 400);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { deletedAt: new Date(), authVersion: { increment: 1 } },
    }),
    prisma.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: target.id,
    action: "staff.deactivated",
    resourceType: "user",
    resourceId: target.id,
  });
  res.json({ ok: true });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const targetId = String(req.params.id ?? "");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !isStaffRole(target.role)) throw new AppError("Staff account not found", 404);
  if (target.role === "super_admin") throw new AppError("The Super Admin profile is protected", 400);
  if (target.id === req.user!.userId && req.body.role && req.body.role !== target.role) throw new AppError("You cannot change your own role", 400);
  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : target.fullName;
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() || null : target.email;
  const role = typeof req.body.role === "string" ? req.body.role.trim().toLowerCase() : target.role;
  if (fullName.length < 2 || fullName.length > 120) throw new AppError("Enter the staff member's full name", 400);
  if (!(INVITABLE_STAFF_ROLES as readonly string[]).includes(role)) throw new AppError(`Role must be one of: ${INVITABLE_STAFF_ROLES.join(", ")}`, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email address", 400);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { fullName, email, role }, select: STAFF_SELECT });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: target.id, action: "staff.updated", resourceType: "user", resourceId: target.id, metadata: { previousRole: target.role, role } });
  res.json({ staff: { ...updated, status: updated.deletedAt ? "deactivated" : updated.phoneVerified ? "active" : "invited" } });
});

router.post("/:id/reactivate", async (req: Request, res: Response) => {
  const targetId = String(req.params.id ?? "");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.deletedAt || !isStaffRole(target.role)) throw new AppError("Deactivated staff account not found", 404);
  if (target.role === "super_admin") throw new AppError("The Super Admin profile is protected", 400);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { deletedAt: null, authVersion: { increment: 1 } }, select: STAFF_SELECT });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: target.id, action: "staff.reactivated", resourceType: "user", resourceId: target.id });
  res.json({ ok: true, staff: { ...updated, status: updated.phoneVerified ? "active" : "invited" } });
});

export default router;
