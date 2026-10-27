import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { validateNewPassword } from "../lib/otp.js";
import {
  authenticateToken,
  INVITABLE_STAFF_ROLES,
  isStaffRole,
  requirePermissions,
} from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import { writeAuditEvent } from "../lib/audit.js";
import { listAuthorityLimits, setAuthorityLimit } from "../lib/credit-authority.js";
import { roleLevel } from "../lib/credit-roles.js";

const router = Router();

// Every endpoint in this router is Super Admin only. Invitable roles exclude
// super_admin itself: a second super admin can only be created by seeding,
// never through an invite, so staff.manage cannot be used to clone itself.
router.use(authenticateToken, requirePermissions("staff.manage"));

// Credit approval authority per role (super admin only). Omit or null to remove a limit.
router.get("/authority-limits", async (_req: Request, res: Response) => {
  res.json({ limits: await listAuthorityLimits() });
});

router.put("/authority-limits/:role", async (req: Request, res: Response) => {
  const role = String(req.params.role || "").toLowerCase();
  if (!roleLevel(role)) throw new AppError("Authority limits apply only to credit approval roles", 400);
  const raw = req.body?.maxAmount;
  const maxAmount = raw === null || raw === undefined || raw === "" ? null : Math.round(Number(raw));
  if (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount <= 0)) throw new AppError("maxAmount must be a positive amount in UGX, or null to remove the limit", 400);
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 10) throw new AppError("Record why the limit is changing (at least 10 characters)", 400);
  await setAuthorityLimit(role, maxAmount, req.user!.userId);
  await writeAuditEvent({ actorId: req.user!.userId, action: "credit.authority_limit_changed", resourceType: "credit_authority_limit", resourceId: role, metadata: { maxAmount, reason } });
  res.json({ ok: true, role, maxAmount });
});

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
  passwordHash: true,
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
    staff: staff.map(({ passwordHash, ...member }) => ({
      ...member,
      status: member.deletedAt
        ? "deactivated"
        : member.phoneVerified
          ? "active"
          : passwordHash ? "pending_approval" : "invited",
    })),
  });
});

router.post("/invite", async (req: Request, res: Response) => {
  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid staff work email", 400);
  const role = typeof req.body.role === "string" ? req.body.role.trim().toLowerCase() : "";

  if (fullName.length < 2 || fullName.length > 120) throw new AppError("Enter the staff member's full name", 400);
  if (!(INVITABLE_STAFF_ROLES as readonly string[]).includes(role)) {
    throw new AppError(`Role must be one of: ${INVITABLE_STAFF_ROLES.join(", ")}`, 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.deletedAt) {
    if (isStaffRole(existing.role) && !existing.passwordHash && !existing.phoneVerified) {
      // The staff member creates a password; no expiring invitation is needed.
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
    throw new AppError("That email already belongs to an account", 409);
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      role,
      phoneVerified: false,
      passwordHash: null,
    },
  });

  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: user.id,
    action: "staff.invited",
    resourceType: "user",
    resourceId: user.id,
    metadata: { role },
  });

  const created = await prisma.user.findUnique({ where: { id: user.id }, select: STAFF_SELECT });
  const { passwordHash: _passwordHash, ...safeCreated } = created!;
  res.status(201).json({ ok: true, staff: { ...safeCreated, status: "invited" } });
});

router.post("/:id/approve", async (req: Request, res: Response) => {
  const targetId = String(req.params.id ?? "");
  const result = await prisma.user.updateMany({
    where: { id: targetId, deletedAt: null, phoneVerified: false, passwordHash: { not: null }, role: { in: [...INVITABLE_STAFF_ROLES] } },
    data: { phoneVerified: true, authVersion: { increment: 1 } },
  });
  if (result.count !== 1) throw new AppError("Staff account is not awaiting approval", 409);
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: targetId, action: "staff.signup_approved", resourceType: "user", resourceId: targetId });
  res.json({ ok: true });
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
  const updated = await prisma.$transaction(async tx => {
    const member = await tx.user.update({ where: { id: target.id }, data: { fullName, email, role, authVersion: { increment: 1 } }, select: STAFF_SELECT });
    await tx.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return member;
  });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: target.id, action: "staff.updated", resourceType: "user", resourceId: target.id, metadata: { previousRole: target.role, role } });
  const { passwordHash, ...safeUpdated } = updated;
  res.json({ staff: { ...safeUpdated, status: updated.deletedAt ? "deactivated" : updated.phoneVerified ? "active" : passwordHash ? "pending_approval" : "invited" } });
});

router.post("/:id/reactivate", async (req: Request, res: Response) => {
  const targetId = String(req.params.id ?? "");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.deletedAt || !isStaffRole(target.role)) throw new AppError("Deactivated staff account not found", 404);
  if (target.role === "super_admin") throw new AppError("The Super Admin profile is protected", 400);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { deletedAt: null, authVersion: { increment: 1 } }, select: STAFF_SELECT });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: target.id, action: "staff.reactivated", resourceType: "user", resourceId: target.id });
  const { passwordHash, ...safeUpdated } = updated;
  res.json({ ok: true, staff: { ...safeUpdated, status: updated.phoneVerified ? "active" : passwordHash ? "pending_approval" : "invited" } });
});

router.post("/:id/reset-password", async (req: Request, res: Response) => {
  // Staff credentials are never returned. An administrative reset always invalidates sessions.
  const targetId = String(req.params.id ?? "");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt || !isStaffRole(target.role)) throw new AppError("Active staff account not found", 404);
  if (target.id === req.user!.userId || target.role === "super_admin") throw new AppError("Use account recovery for the Super Admin account", 403);
  if (!target.phoneVerified || !target.passwordHash) throw new AppError("Staff member must finish account activation before a password reset", 409);
  let newPassword: string;
  try { newPassword = validateNewPassword(req.body?.newPassword); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid password", 400); }
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: {
      passwordHash: hash, authVersion: { increment: 1 }, loginAttempts: 0, loginLockedUntil: null,
    } }),
    prisma.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAuditEvent({
    actorId: req.user!.userId, subjectUserId: target.id,
    action: "staff.password_reset_by_admin", resourceType: "user", resourceId: target.id,
  });
  res.json({ ok: true, message: "Password reset and all active sessions revoked." });
});

export default router;
