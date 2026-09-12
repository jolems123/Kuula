import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission, normalizeRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
const allowedCategories = new Set(["general","account","kyc","loan","repayment","technical"]);
const allowedPriorities = new Set(["low","normal","high","urgent"]);
const allowedStatuses = new Set(["open","in_progress","closed"]);

router.use(authenticateToken, (req, _res, next) => hasPermission(req.user!.role, "support.manage") ? next() : next(new AppError("Insufficient permissions", 403)));

router.get("/", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && status !== "all" && !allowedStatuses.has(status)) throw new AppError("Invalid ticket status", 400);
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT t.*, c.full_name AS customer_name, c.phone AS customer_phone,
      a.full_name AS assignee_name, COUNT(m.id)::int AS message_count,
      MAX(m.created_at) AS last_message_at
    FROM support_tickets t JOIN users c ON c.id=t.customer_id
    LEFT JOIN users a ON a.id=t.assigned_to LEFT JOIN messages m ON m.ticket_id=t.id
    WHERE (${status ?? null}::text IS NULL OR ${status ?? null}='all' OR t.status=${status ?? null})
    GROUP BY t.id,c.full_name,c.phone,a.full_name ORDER BY t.updated_at DESC`);
  res.json({ tickets: rows });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const category = req.body.category == null ? null : String(req.body.category);
  const priority = req.body.priority == null ? null : String(req.body.priority);
  const status = req.body.status == null ? null : String(req.body.status);
  const assignedTo = req.body.assignedTo === null ? null : req.body.assignedTo ? String(req.body.assignedTo) : undefined;
  if (category && !allowedCategories.has(category)) throw new AppError("Invalid category", 400);
  if (priority && !allowedPriorities.has(priority)) throw new AppError("Invalid priority", 400);
  if (status && !allowedStatuses.has(status)) throw new AppError("Invalid status", 400);
  if (assignedTo) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedTo, deletedAt: null }, select: { role: true } });
    if (!assignee || !hasPermission(normalizeRole(assignee.role), "support.manage")) throw new AppError("Assignee must be active support staff", 422);
  }
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`UPDATE support_tickets SET
    category=COALESCE(${category},category), priority=COALESCE(${priority},priority),
    status=COALESCE(${status},status), assigned_to=CASE WHEN ${assignedTo === undefined} THEN assigned_to ELSE ${assignedTo ?? null}::uuid END,
    closed_at=CASE WHEN ${status}='closed' THEN CURRENT_TIMESTAMP WHEN ${status} IS NOT NULL THEN NULL ELSE closed_at END,
    updated_at=CURRENT_TIMESTAMP WHERE id=${id}::uuid RETURNING *`);
  if (!rows[0]) throw new AppError("Ticket not found", 404);
  await prisma.auditEvent.create({ data: { actorId:req.user!.userId, subjectUserId:rows[0].customer_id, action:"support.ticket_updated", resourceType:"support_ticket", resourceId:id, metadata:{ category,priority,status,assignedTo } } });
  res.json({ ticket: rows[0] });
});

export default router;
