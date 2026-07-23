import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

function mapGoal(goal: {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  target: bigint;
  saved: bigint;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...goal,
    target: Number(goal.target),
    saved: Number(goal.saved),
  };
}

// GET /api/goals
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "asc" },
  });

  res.json({ goals: goals.map(mapGoal) });
});

// POST /api/goals
router.post("/", authenticateToken, async (req: Request, res: Response) => {
  const { name, emoji, target, color } = req.body;
  const userId = req.user!.userId;

  const parsedTarget = Number(target);
  if (!name?.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
    throw new AppError("Name and target are required", 400);
  }

  const goal = await prisma.savingsGoal.create({
    data: { userId, name: name.trim(), emoji: emoji || "🎯", target: BigInt(Math.round(parsedTarget)), color: color || "#F4612B" },
  });

  res.json({ goal: mapGoal(goal) });
});

// PATCH /api/goals/:id
router.patch("/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  const existing = await prisma.savingsGoal.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError("Goal not found", 404);

  const data: any = { ...req.body, updatedAt: new Date() };

  if (typeof data.name === "string") data.name = data.name.trim();
  if (data.target !== undefined) {
    const parsedTarget = Number(data.target);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      throw new AppError("Target must be a positive number", 400);
    }
    data.target = BigInt(Math.round(parsedTarget));
  }
  if (data.saved !== undefined) {
    const parsedSaved = Number(data.saved);
    if (!Number.isFinite(parsedSaved) || parsedSaved < 0) {
      throw new AppError("Saved must be a non-negative number", 400);
    }
    data.saved = BigInt(Math.round(parsedSaved));
  }

  const goal = await prisma.savingsGoal.update({
    where: { id },
    data,
  });

  res.json({ goal: mapGoal(goal) });
});

// DELETE /api/goals/:id
router.delete("/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  const existing = await prisma.savingsGoal.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError("Goal not found", 404);

  await prisma.savingsGoal.delete({
    where: { id },
  });
  res.json({ ok: true });
});

export default router;
