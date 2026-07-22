import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

// GET /api/messages
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  const where = isAdmin
    ? {}
    : { OR: [{ senderId: userId }, { receiverId: userId }] };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      receiverId: m.receiverId,
      content: m.content,
      createdAt: m.createdAt,
      isRead: m.isRead,
    })),
  });
});

// POST /api/messages
router.post("/", authenticateToken, async (req: Request, res: Response) => {
  const { content, receiverId } = req.body;
  const userId = req.user!.userId;

  if (!content?.trim()) throw new AppError("Message content is required", 400);

  // Customers can only message admins
  if (req.user!.role !== "admin") {
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    const targetId = receiverId || admin?.id;
    if (!targetId) throw new AppError("No admin available", 400);

    const message = await prisma.message.create({
      data: { senderId: userId, receiverId: targetId, content: content.trim() },
    });

    res.json({
      message: {
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        createdAt: message.createdAt,
        isRead: message.isRead,
      },
    });
    return;
  }

  // Admin can message anyone
  if (!receiverId) throw new AppError("Receiver ID is required", 400);

  const message = await prisma.message.create({
    data: { senderId: userId, receiverId, content: content.trim() },
  });

  res.json({
    message: {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      createdAt: message.createdAt,
      isRead: message.isRead,
    },
  });
});

export default router;
