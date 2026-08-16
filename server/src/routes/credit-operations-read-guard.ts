import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("customer.view"));

function validUuid(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError("Resource ID is invalid", 400);
  }
  return id;
}

async function assignedAtAnyStage(applicationId: string, userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM approval_assignments
    WHERE application_id=${applicationId}::uuid
      AND assignee_id=${userId}::uuid
    LIMIT 1
  `);
  return Boolean(rows[0]);
}

async function assertCaseRead(req: Request, applicationId: string): Promise<void> {
  // Admin is the supervisory/audit role. Operational officers and managers may
  // only open cases they have actually been assigned at some point in the case.
  if (req.user!.role === "admin") return;
  if (!(await assignedAtAnyStage(applicationId, req.user!.userId))) {
    throw new AppError("This credit case is outside your assigned workload", 403);
  }
}

async function auditRead(req: Request, applicationId: string, action: string, resourceType: string, resourceId: string): Promise<void> {
  await writeAuditEvent({
    actorId: req.user!.userId,
    action,
    resourceType,
    resourceId,
    metadata: { applicationId },
  });
}

router.get("/applications/:id", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = validUuid(req.params.id);
  await assertCaseRead(req, applicationId);
  await auditRead(req, applicationId, "credit.case_viewed", "loan_application", applicationId);
  next();
});

router.get("/applications/:id/messages", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = validUuid(req.params.id);
  await assertCaseRead(req, applicationId);
  await auditRead(req, applicationId, "credit.case_messages_viewed", "loan_application", applicationId);
  next();
});

router.get("/evidence/:evidenceId/access", async (req: Request, _res: Response, next: NextFunction) => {
  const evidenceId = validUuid(req.params.evidenceId);
  const rows = await prisma.$queryRaw<Array<{ application_id: string }>>(Prisma.sql`
    SELECT application_id FROM evaluation_evidence WHERE id=${evidenceId}::uuid LIMIT 1
  `);
  const applicationId = rows[0]?.application_id;
  if (!applicationId) throw new AppError("Evidence not found", 404);
  await assertCaseRead(req, applicationId);
  // The downstream handler records the actual document access audit event.
  next();
});

export default router;
