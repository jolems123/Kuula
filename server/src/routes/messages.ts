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
  const content = typeof req.body?.content === "string" ? req.body.content.trim().slice(0, 3000) : "";
  const receiverId = typeof req.body?.receiverId === "string" ? req.body.receiverId.trim() : "";
  const userId = req.user!.userId;

  if (!content) throw new AppError("Message content is required", 400);

  // Non-admin users never control the destination of the generic support
  // channel. This prevents customer-to-customer IDOR/phishing by supplying an
  // arbitrary receiverId. Application-specific communication uses its own
  // ownership-scoped route.
  if (req.user!.role !== "admin") {
    const admin = await prisma.user.findFirst({
      where: { role: "admin", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!admin) throw new AppError("No support administrator is available", 503);

    const message = await prisma.message.create({
      data: { senderId: userId, receiverId: admin.id, content },
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

  if (!receiverId) throw new AppError("Receiver ID is required", 400);
  const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, deletedAt: true } });
  if (!receiver || receiver.deletedAt) throw new AppError("Receiver not found", 404);

  const message = await prisma.message.create({
    data: { senderId: userId, receiverId: receiver.id, content },
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
