import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
router.use(authenticateToken, requirePermissions("customer.view"));

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
