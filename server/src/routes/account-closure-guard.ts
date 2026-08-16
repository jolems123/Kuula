import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
const OPEN_FINANCIAL_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];

router.post("/", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const [openApplication, openRepayment, pendingTransaction] = await Promise.all([
    prisma.loanApplication.findFirst({
      where: { applicantId: userId, status: { in: OPEN_FINANCIAL_STATUSES } },
      select: { id: true, status: true },
    }),
    prisma.repayment.findFirst({
      where: { userId, status: { not: "paid" } },
      select: { id: true, loanId: true, status: true },
    }),
    prisma.transaction.findFirst({
      where: { userId, status: "pending" },
      select: { id: true, type: true },
    }),
  ]);

  if (openApplication || openRepayment || pendingTransaction) {
    throw new AppError(
      "Your Kuula login cannot be closed while a credit application, unsettled payment, or repayment obligation is still open. Contact support to close or settle the financial relationship first.",
      409
    );
  }
  next();
});

export default router;
