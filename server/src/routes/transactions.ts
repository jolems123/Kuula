import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();
const ACTIVE_TRANSACTION_TYPES = ["loan_disbursement", "loan_disbursement_leg", "loan_payment"];

// GET /api/transactions
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  const where = {
    ...(isAdmin ? {} : { userId }),
    type: { in: ACTIVE_TRANSACTION_TYPES },
  };

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      userId: true,
      loanId: true,
      type: true,
      amount: true,
      status: true,
      reference: true,
      provider: true,
      providerStatus: true,
      reconciliationStatus: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      ...(isAdmin ? { userId: transaction.userId } : {}),
      loanId: transaction.loanId,
      type: transaction.type,
      amount: Number(transaction.amount),
      status: transaction.status,
      reference: transaction.reference,
      provider: transaction.provider,
      providerStatus: transaction.providerStatus,
      reconciliationStatus: transaction.reconciliationStatus,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    })),
  });
});

export default router;
