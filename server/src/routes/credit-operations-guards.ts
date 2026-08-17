import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
router.use(authenticateToken, requirePermissions("loan.review"));

function uuid(value: unknown, label: string): string {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(`${label} is invalid`, 400);
  }
  return id;
}

function levelForRole(role: string): number {
  if (role === "officer") return 1;
  if (role === "manager") return 2;
  if (role === "admin") return 3;
  return 0;
}

async function activeAssignment(applicationId: string, userId: string, level: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM approval_assignments
    WHERE application_id = ${applicationId}::uuid
      AND level = ${level}
      AND assignee_id = ${userId}::uuid
      AND status = 'active'
    LIMIT 1
  `);
  return Boolean(rows[0]);
}

async function assertCurrentAssignment(applicationId: string, userId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ current_level: number; current_assignee_id: string | null }>>(Prisma.sql`
    SELECT current_level, current_assignee_id
    FROM credit_cases
    WHERE application_id = ${applicationId}::uuid
    LIMIT 1
  `);
  const creditCase = rows[0];
  if (!creditCase) throw new AppError("Credit case not found", 404);
  if (
    creditCase.current_assignee_id !== userId
    || !(await activeAssignment(applicationId, userId, Number(creditCase.current_level)))
  ) {
    throw new AppError("This application is not assigned to you at the current review level", 403);
  }
}

// Every staff role sees only work explicitly assigned to that staff account.
// This endpoint intentionally shadows the older dashboard implementation.
router.get("/dashboard", async (req: Request, res: Response) => {
  const level = levelForRole(req.user!.role);
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
    JOIN approval_assignments aa ON aa.application_id = c.application_id
      AND aa.level = c.current_level
      AND aa.status = 'active'
      AND aa.assignee_id = ${userId}::uuid
    WHERE c.current_level = ${level}
      AND c.current_assignee_id = ${userId}::uuid
      AND c.status NOT IN ('completed','rejected','ready_for_offer')
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

// Case details and case messages contain sensitive customer, underwriting and
// field-evidence metadata. Enforce assignment here as well as in the downstream
// route implementation so security does not depend on mount order alone.
router.get("/applications/:id", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = uuid(req.params.id, "Application ID");
  await assertCurrentAssignment(applicationId, req.user!.userId);
  next();
});
router.get("/applications/:id/messages", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = uuid(req.params.id, "Application ID");
  await assertCurrentAssignment(applicationId, req.user!.userId);
  next();
});

// The generic assignment endpoint may create the first Level-1 assignment or
// reassign the *current* level. It cannot be used to advance/skip review levels.
router.post("/applications/:id/assign", requirePermissions("loan.approve"), async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = uuid(req.params.id, "Application ID");
  const requestedLevel = Number(req.body?.level ?? 1);
  if (![1, 2, 3].includes(requestedLevel)) throw new AppError("Review level must be 1, 2, or 3", 400);

  const rows = await prisma.$queryRaw<Array<{ current_level: number; status: string }>>(Prisma.sql`
    SELECT current_level, status FROM credit_cases WHERE application_id=${applicationId}::uuid LIMIT 1
  `);
  const existing = rows[0];
  if (!existing) {
    if (requestedLevel !== 1) throw new AppError("A new credit case must start at Level 1 field evaluation", 409);
    next();
    return;
  }
  if (["completed", "rejected", "ready_for_offer"].includes(existing.status)) {
    throw new AppError("Completed credit cases cannot be reassigned", 409);
  }
  if (requestedLevel !== Number(existing.current_level)) {
    throw new AppError("Use the review submit/return workflow to move an application between approval levels", 409);
  }
  next();
});

// Decision actions are assigned-work only at every level, including the final
// credit authority. This closes the legacy Level-3 admin bypass.
router.post("/applications/:id/decision", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = uuid(req.params.id, "Application ID");
  await assertCurrentAssignment(applicationId, req.user!.userId);
  next();
});

// Level-1 evaluation/evidence and every submit handoff are also assigned-work only.
router.use("/applications/:id/evaluation", async (req: Request, _res: Response, next: NextFunction) => {
  if (req.method !== "POST") return next();
  const applicationId = uuid(req.params.id, "Application ID");
  if (!(await activeAssignment(applicationId, req.user!.userId, 1))) throw new AppError("This Level-1 evaluation is not assigned to you", 403);
  next();
});
router.use("/applications/:id/evidence", async (req: Request, _res: Response, next: NextFunction) => {
  if (req.method !== "POST") return next();
  const applicationId = uuid(req.params.id, "Application ID");
  if (!(await activeAssignment(applicationId, req.user!.userId, 1))) throw new AppError("This Level-1 evidence task is not assigned to you", 403);
  next();
});
router.post("/applications/:id/submit", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = uuid(req.params.id, "Application ID");
  const level = levelForRole(req.user!.role);
  if (!level || !(await activeAssignment(applicationId, req.user!.userId, level))) {
    throw new AppError("This application is not assigned to you at the current review level", 403);
  }
  next();
});

export default router;
