import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken);

async function ownApplication(applicationId: string, userId: string) {
  const application = await prisma.loanApplication.findUnique({ where: { id: applicationId }, select: { id: true, applicantId: true } });
  if (!application || application.applicantId !== userId) throw new AppError("Application not found", 404);
  return application;
}

router.get("/applications/:id/messages", async (req: Request, res: Response) => {
  const applicationId = String(req.params.id || "");
  await ownApplication(applicationId, req.user!.userId);
  const messages = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT m.id, m.sender_id, m.content, m.created_at, u.full_name AS sender_name, u.role AS sender_role
    FROM application_messages m
    JOIN users u ON u.id=m.sender_id
    WHERE m.application_id=${applicationId}::uuid AND m.message_type='customer'
    ORDER BY m.created_at
  `);
  res.json({ messages });
});

router.post("/applications/:id/messages", async (req: Request, res: Response) => {
  const applicationId = String(req.params.id || "");
  const application = await ownApplication(applicationId, req.user!.userId);
  const content = typeof req.body?.content === "string" ? req.body.content.trim().slice(0, 3000) : "";
  if (!content) throw new AppError("Message is required", 400);
  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO application_messages (id, application_id, sender_id, recipient_id, message_type, content)
    VALUES (${id}::uuid, ${applicationId}::uuid, ${req.user!.userId}::uuid, NULL, 'customer', ${content})
  `);
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.customer_message_posted", resourceType: "loan_application", resourceId: applicationId, metadata: { messageId: id } });
  res.status(201).json({ message: { id, content, createdAt: new Date().toISOString() } });
});

export default router;
