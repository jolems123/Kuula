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
  return { ...goal, target: Number(goal.target), saved: 0 };
}

router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ goals: goals.map(mapGoal), operationsEnabled: false });
});

router.post("/", authenticateToken, async (req: Request, res: Response) => {
  const { name, emoji, target, color } = req.body;
  const userId = req.user!.userId;
  const parsedTarget = Number(target);
  if (typeof name !== "string" || !name.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
    throw new AppError("Name and target are required", 400);
  }
  const goal = await prisma.savingsGoal.create({
    data: {
      userId,
      name: name.trim().slice(0, 100),
      emoji: typeof emoji === "string" ? emoji.slice(0, 8) : "🎯",
      target: BigInt(Math.round(parsedTarget)),
      saved: BigInt(0),
      color: typeof color === "string" ? color.slice(0, 20) : "#0B5E3A",
    },
  });
  res.status(201).json({ goal: mapGoal(goal), operationsEnabled: false });
});

router.patch("/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const userId = req.user!.userId;
  const existing = await prisma.savingsGoal.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError("Goal not found", 404);
  if (req.body?.saved !== undefined) {
    throw new AppError("Goal progress cannot be edited while savings money operations are disabled", 409);
  }

  const data: { name?: string; emoji?: string; target?: bigint; color?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") {
    const name = req.body.name.trim();
    if (!name) throw new AppError("Goal name cannot be empty", 400);
    data.name = name.slice(0, 100);
  }
  if (typeof req.body?.emoji === "string") data.emoji = req.body.emoji.slice(0, 8);
  if (typeof req.body?.color === "string") data.color = req.body.color.slice(0, 20);
  if (req.body?.target !== undefined) {
    const target = Math.round(Number(req.body.target));
    if (!Number.isFinite(target) || target <= 0) throw new AppError("Target must be a positive number", 400);
    data.target = BigInt(target);
  }

  const goal = await prisma.savingsGoal.update({ where: { id }, data });
  res.json({ goal: mapGoal(goal), operationsEnabled: false });
});

router.delete("/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const userId = req.user!.userId;
  const existing = await prisma.savingsGoal.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError("Goal not found", 404);
  await prisma.savingsGoal.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
