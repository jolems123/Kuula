/**
 * Admin → Staff accounts. Restricted to the `admin` role.
 *
 * Staff sign in through /api/auth/admin-login, which only accepts
 * `role = "admin"`; customers (`role = "user"`) can never be promoted here and
 * staff can never be demoted into customers — the two populations stay disjoint.
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { requireRoles } from "../../middleware/auth.js";
import { audit } from "../../lib/audit.js";
import { revokeAllSessions } from "../../lib/sessions.js";
import { requireUuid, str } from "./shared.js";

const router = Router();
router.use(requireRoles("admin"));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapStaff(u: any, isSelf: boolean) {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    active: !u.deletedAt,
    deactivatedAt: u.deletedAt ?? null,
    createdAt: u.createdAt,
    isSelf,
  };
}

// GET /api/admin/staff
router.get("/", async (req: Request, res: Response) => {
  const rows = await prisma.user.findMany({ where: { role: "admin" }, orderBy: { createdAt: "asc" } });
  const lastLogins = await prisma.auditEvent.findMany({
    where: { action: "auth.admin_login", actorId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    distinct: ["actorId"],
    select: { actorId: true, createdAt: true },
  });
  const lastLoginBy = new Map(lastLogins.map((l) => [l.actorId, l.createdAt]));

  res.json({
    staff: rows.map((u) => ({ ...mapStaff(u, u.id === req.user!.userId), lastLoginAt: lastLoginBy.get(u.id) ?? null })),
  });
});

// POST /api/admin/staff — create a staff login.
router.post("/", async (req: Request, res: Response) => {
  const fullName = str(req.body?.fullName);
  const email = str(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (fullName.length < 2) throw new AppError("Full name is required", 400);
  if (!EMAIL_RE.test(email)) throw new AppError("A valid email is required", 400);
  if (password.length < 10) throw new AppError("Password must be at least 10 characters", 400);

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) throw new AppError("An account with that email already exists", 409);

  const user = await prisma.user.create({
    data: {
      role: "admin",
      fullName,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      verified: true,
      phoneVerified: false,
    },
  });

  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "staff.created", entityType: "user", entityId: user.id,
    metadata: { email, fullName },
  });

  res.status(201).json({ ok: true, staff: mapStaff(user, false) });
});

// PATCH /api/admin/staff/:id — name only (email is the login identity).
router.patch("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "staff id");
  const user = await prisma.user.findFirst({ where: { id, role: "admin" } });
  if (!user) throw new AppError("Staff member not found", 404);

  const fullName = str(req.body?.fullName);
  if (fullName.length < 2) throw new AppError("Full name is required", 400);
  if (fullName === user.fullName) {
    res.json({ ok: true, staff: mapStaff(user, id === req.user!.userId) });
    return;
  }

  const updated = await prisma.user.update({ where: { id }, data: { fullName } });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "staff.updated", entityType: "user", entityId: id,
    metadata: { changes: { fullName: { from: user.fullName, to: fullName } } },
  });
  res.json({ ok: true, staff: mapStaff(updated, id === req.user!.userId) });
});

// POST /api/admin/staff/:id/deactivate
router.post("/:id/deactivate", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "staff id");
  if (id === req.user!.userId) throw new AppError("You cannot deactivate your own account", 400);

  const user = await prisma.user.findFirst({ where: { id, role: "admin" } });
  if (!user) throw new AppError("Staff member not found", 404);
  if (user.deletedAt) throw new AppError("This staff member is already deactivated", 409);

  const activeAdmins = await prisma.user.count({ where: { role: "admin", deletedAt: null } });
  if (activeAdmins <= 1) throw new AppError("At least one active admin must remain", 409);

  const updated = await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  const revoked = await revokeAllSessions(id);
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "staff.deactivated", entityType: "user", entityId: id,
    metadata: { reason: str(req.body?.reason) || null, sessionsRevoked: revoked },
  });

  res.json({ ok: true, staff: mapStaff(updated, false) });
});

// POST /api/admin/staff/:id/reactivate
router.post("/:id/reactivate", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "staff id");
  const user = await prisma.user.findFirst({ where: { id, role: "admin" } });
  if (!user) throw new AppError("Staff member not found", 404);
  if (!user.deletedAt) throw new AppError("This staff member is already active", 409);

  const updated = await prisma.user.update({ where: { id }, data: { deletedAt: null } });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "staff.reactivated", entityType: "user", entityId: id,
  });

  res.json({ ok: true, staff: mapStaff(updated, false) });
});

export default router;
