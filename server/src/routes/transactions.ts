import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// GET /api/transactions
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isAdmin = req.user!.role === "admin";
  const where = isAdmin ? {} : { userId };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      loanId: true,
      type: true,
      amount: true,
      status: true,
      reference: true,
      providerStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Never expose raw provider payloads, provider UUIDs, reconciliation metadata,
  // or internal callback details to the customer-facing client. Those remain in
  // the authenticated reconciliation/admin APIs.
  res.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      ...(isAdmin ? { userId: t.userId } : {}),
      loanId: t.loanId,
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      providerStatus: t.providerStatus,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
});

export default router;
