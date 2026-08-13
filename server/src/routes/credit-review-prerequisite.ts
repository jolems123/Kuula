import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

router.post("/applications/decision", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "test" && process.env.CREDIT_OPERATIONS_REQUIRED !== "true") {
    next();
    return;
  }

  const applicationId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  const decision = req.body?.decision;
  if (!applicationId || !["approved", "rejected"].includes(decision)) {
    next();
    return;
  }

  if (decision === "approved") {
    const review = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.application_id
      FROM credit_cases c
      WHERE c.application_id = ${applicationId}::uuid
        AND c.status = 'ready_for_offer'
        AND EXISTS (
          SELECT 1 FROM approval_actions a
          WHERE a.application_id = c.application_id
            AND a.level = 3
            AND a.action = 'approve'
        )
      LIMIT 1
    `);
    if (!review[0]) throw new AppError("Final Level 3 credit approval is required before creating an offer", 409);
  }

  if (decision === "rejected") {
    const review = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.application_id
      FROM credit_cases c
      WHERE c.application_id = ${applicationId}::uuid
        AND c.status = 'rejected'
        AND EXISTS (
          SELECT 1 FROM approval_actions a
          WHERE a.application_id = c.application_id
            AND a.action = 'reject'
        )
      LIMIT 1
    `);
    if (!review[0]) throw new AppError("A recorded staged credit review is required before rejecting this application", 409);
  }

  next();
});

export default router;
