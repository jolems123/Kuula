import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// GET /api/notifications
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notifications });
});

// POST /api/notifications/:id/read
router.post("/:id/read", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.userId },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post("/read-all", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

export default router;
