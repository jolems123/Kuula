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
  });

  res.json({
    transactions: transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
    })),
  });
});

export default router;
