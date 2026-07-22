import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { COMPLIANCE } from "../lib/compliance.js";

const router = Router();

// GET /api/savings
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const savings = await prisma.savingsAccount.findUnique({
    where: { userId: req.user!.userId },
  });
  res.json({
    balance: Number(savings?.balance ?? 0),
    accruedInterest: 0,
    aprPercent: COMPLIANCE.savingsAprPercent,
  });
});

// POST /api/savings/deposit
router.post("/deposit", authenticateToken, async (req: Request, res: Response) => {
  const { amount } = req.body;
  const userId = req.user!.userId;
  const delta = Math.round(Number(amount));

  if (!delta || delta <= 0) throw new AppError("Amount must be positive", 400);

  const savings = await prisma.savingsAccount.findUnique({ where: { userId } });
  if (!savings) throw new AppError("Savings account not found", 404);

  const newBalance = Number(savings.balance) + delta;

  await prisma.savingsAccount.update({
    where: { userId },
    data: { balance: newBalance, updatedAt: new Date() },
  });

  await prisma.transaction.create({
    data: { userId, type: "savings_deposit", amount: BigInt(delta), status: "completed" },
  });

  res.json({ balance: newBalance });
});

// POST /api/savings/withdraw
router.post("/withdraw", authenticateToken, async (req: Request, res: Response) => {
  const { amount } = req.body;
  const userId = req.user!.userId;
  const delta = Math.round(Number(amount));

  if (!delta || delta <= 0) throw new AppError("Amount must be positive", 400);

  const savings = await prisma.savingsAccount.findUnique({ where: { userId } });
  if (!savings) throw new AppError("Savings account not found", 404);

  const currentBalance = Number(savings.balance);
  if (currentBalance < delta) throw new AppError("Insufficient savings balance", 400);

  const newBalance = currentBalance - delta;

  await prisma.savingsAccount.update({
    where: { userId },
    data: { balance: newBalance, updatedAt: new Date() },
  });

  await prisma.transaction.create({
    data: { userId, type: "savings_withdrawal", amount: BigInt(delta), status: "completed" },
  });

  res.json({ balance: newBalance });
});

export default router;
