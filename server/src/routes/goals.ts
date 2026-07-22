import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

// GET /api/goals
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "asc" },
  });

  res.json({ goals });
});

// POST /api/goals
router.post("/", authenticateToken, async (req: Request, res: Response) => {
  const { name, emoji, target, color } = req.body;
  const userId = req.user!.userId;

  if (!name?.trim() || !target) throw new AppError("Name and target are required", 400);

  const goal = await prisma.savingsGoal.create({
    data: { userId, name, emoji: emoji || "🎯", target: BigInt(Math.round(Number(target))), color: color || "#FF6B35" },
  });

  res.json({ goal });
});

// PATCH /api/goals/:id
router.patch("/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data: any = { ...req.body, updatedAt: new Date() };

  if (data.target) data.target = BigInt(Math.round(Number(data.target)));
  if (data.saved) data.saved = BigInt(Math.round(Number(data.saved)));

  const goal = await prisma.savingsGoal.update({
    where: { id, userId: req.user!.userId },
    data,
  });

  res.json({ goal });
});

// DELETE /api/goals/:id
router.delete("/:id", authenticateToken, async (req: Request, res: Response) => {
  await prisma.savingsGoal.delete({
    where: { id: req.params.id as string, userId: req.user!.userId },
  });
  res.json({ ok: true });
});

export default router;
