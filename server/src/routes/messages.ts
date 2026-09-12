import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
const CUSTOMER_ROLES = new Set(["user", "customer"]);
const MAX_MESSAGE_LENGTH = 2_000;

// GET /api/messages
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isAdmin = hasPermission(req.user!.role, "support.manage");

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
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  const receiverId = typeof req.body.receiverId === "string" ? req.body.receiverId : undefined;
  const userId = req.user!.userId;

  if (!content) throw new AppError("Message content is required", 400);
  if (content.length > MAX_MESSAGE_LENGTH) throw new AppError(`Message content must be ${MAX_MESSAGE_LENGTH} characters or fewer`, 400);

  if (CUSTOMER_ROLES.has(req.user!.role)) {
    // Customer support messages are always routed server-side to an active admin.
    // Never trust a caller-supplied receiverId: that would allow customer-to-customer messaging.
    const admin = await prisma.user.findFirst({
      where: { role: { in: ["support", "administrator", "admin", "super_admin"] }, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new AppError("Kuula support is temporarily unavailable", 503);

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

  if (!hasPermission(req.user!.role, "support.manage")) {
    throw new AppError("Use the assigned credit-case communication channel for staff messages", 403);
  }

  if (!receiverId) throw new AppError("Receiver ID is required", 400);
  const receiver = await prisma.user.findFirst({ where: { id: receiverId, deletedAt: null }, select: { id: true } });
  if (!receiver) throw new AppError("Receiver not found", 404);

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
