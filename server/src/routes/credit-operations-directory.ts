import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
router.use(authenticateToken, requirePermissions("customer.view"));

function roleLevel(role: string): number {
  if (role === "officer") return 1;
  if (role === "manager") return 2;
  if (role === "admin") return 3;
  return 0;
}

function maskNin(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

router.get("/dashboard", async (req: Request, res: Response) => {
  const level = roleLevel(req.user!.role);
  if (!level) throw new AppError("Staff role required", 403);
  const userId = req.user!.userId;
  const queue = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.application_id AS id, c.current_level, c.status, c.updated_at,
           a.applicant_name, a.amount, a.purpose, a.created_at,
           u.phone, u.kyc_verified,
           ua.credit_score, ua.approved_limit
    FROM credit_cases c
    JOIN loan_applications a ON a.id = c.application_id
    JOIN users u ON u.id = c.customer_id
    LEFT JOIN underwriting_assessments ua ON ua.application_id = a.id
    LEFT JOIN approval_assignments aa ON aa.application_id = c.application_id
      AND aa.level = c.current_level
      AND aa.status = 'active'
    WHERE c.current_level = ${level}
      AND c.status NOT IN ('completed','rejected')
      AND (${req.user!.role === "admin"}::boolean OR aa.assignee_id = ${userId}::uuid)
    ORDER BY c.updated_at ASC
    LIMIT 200
  `);
  const counts = queue.reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  res.json({
    level,
    role: req.user!.role,
    counts,
    queue: queue.map((row) => ({
      ...row,
      amount: Number(row.amount),
      approved_limit: row.approved_limit == null ? null : Number(row.approved_limit),
    })),
  });
});

router.post("/applications/:id/decision", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = String(req.params.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) throw new AppError("Application ID is invalid", 400);

  const cases = await prisma.$queryRaw<Array<{ current_level: number; assignee_id: string | null }>>(Prisma.sql`
    SELECT c.current_level, aa.assignee_id
    FROM credit_cases c
    LEFT JOIN approval_assignments aa ON aa.application_id = c.application_id
      AND aa.level = c.current_level
      AND aa.status = 'active'
    WHERE c.application_id = ${applicationId}::uuid
    LIMIT 1
  `);
  const current = cases[0];
  if (!current) throw new AppError("Credit case not found", 404);
  if (req.user!.role === "admin" && current.current_level === 3) {
    next();
    return;
  }
  if (current.assignee_id !== req.user!.userId) {
    throw new AppError("This application is not assigned to you at the current review level", 403);
  }
  next();
});

router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  if (q.length < 2) throw new AppError("Search requires at least two characters", 400);
  const like = `%${q}%`;
  const customers = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, full_name, phone, email, national_id, district, occupation,
           kyc_verified, loans_total, loans_repaid, created_at
    FROM users
    WHERE deleted_at IS NULL AND role IN ('user','customer')
      AND (full_name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR national_id ILIKE ${like})
    ORDER BY full_name LIMIT 30
  `);
  const applications = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, applicant_id, applicant_name, amount, purpose, status, loan_id, created_at
    FROM loan_applications
    WHERE id::text ILIKE ${like} OR loan_id ILIKE ${like} OR applicant_name ILIKE ${like} OR purpose ILIKE ${like}
    ORDER BY created_at DESC LIMIT 30
  `);
  const businesses = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON (e.application_id)
      e.application_id, e.business_name, e.business_location, a.applicant_id, a.applicant_name
    FROM credit_evaluations e
    JOIN loan_applications a ON a.id=e.application_id
    WHERE e.business_name ILIKE ${like} OR e.business_location ILIKE ${like}
    ORDER BY e.application_id, e.updated_at DESC LIMIT 30
  `);
  res.json({
    customers: customers.map((row) => ({ ...row, national_id: maskNin(row.national_id) })),
    applications: applications.map((row) => ({ ...row, amount: Number(row.amount) })),
    businesses,
  });
});

router.get("/staff", async (req: Request, res: Response) => {
  const requested = String(req.query.role || "").trim().toLowerCase();
  const roles = requested ? [requested] : ["officer", "manager", "admin"];
  if (roles.some((role) => !["officer", "manager", "admin"].includes(role))) throw new AppError("Invalid staff role", 400);
  const staff = await prisma.user.findMany({
    where: { role: { in: roles }, deletedAt: null },
    select: { id: true, fullName: true, email: true, phone: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    take: 200,
  });
  const loads = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT assignee_id, count(*)::int AS active_count
    FROM approval_assignments WHERE status='active' GROUP BY assignee_id
  `);
  const loadMap = new Map(loads.map((row) => [row.assignee_id, Number(row.active_count)]));
  res.json({ staff: staff.map((row) => ({ ...row, activeCases: loadMap.get(row.id) || 0 })) });
});

router.get("/intake", requirePermissions("loan.approve"), async (_req: Request, res: Response) => {
  const applications = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT a.id, a.applicant_id, a.applicant_name, a.amount, a.purpose, a.status, a.created_at,
           u.phone, u.district, u.kyc_verified,
           ua.credit_score, ua.approved_limit
    FROM loan_applications a
    JOIN users u ON u.id=a.applicant_id
    LEFT JOIN underwriting_assessments ua ON ua.application_id=a.id
    LEFT JOIN credit_cases c ON c.application_id=a.id
    WHERE c.application_id IS NULL AND a.status IN ('pending','resubmitted')
    ORDER BY a.created_at ASC
    LIMIT 200
  `);
  res.json({ applications: applications.map((row) => ({ ...row, amount: Number(row.amount), approved_limit: row.approved_limit == null ? null : Number(row.approved_limit) })) });
});

export default router;