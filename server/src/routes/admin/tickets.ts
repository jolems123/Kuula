/**
 * Admin → Support tickets.
 *
 * Tickets are opened by staff for a customer (from the inbox or the customer
 * record) and tracked through open → pending → resolved → closed. Messages are
 * append-only; state changes are audited.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { audit } from "../../lib/audit.js";
import { parsePage, paged, queryStr, requireUuid, str, isUuid } from "./shared.js";

const router = Router();

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high"] as const;
export const TICKET_CATEGORIES = ["loans", "repayments", "kyc", "savings", "account", "payments", "other"] as const;

const TICKET_INCLUDE = {
  customer: { select: { id: true, fullName: true, phone: true, email: true, deletedAt: true } },
  assignee: { select: { id: true, fullName: true, email: true } },
  _count: { select: { messages: true } },
} as const;

function mapTicket(t: any) {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    customer: t.customer
      ? { id: t.customer.id, fullName: t.customer.fullName, phone: t.customer.phone, email: t.customer.email, active: !t.customer.deletedAt }
      : null,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.fullName || t.assignee.email } : null,
    messageCount: t._count?.messages ?? undefined,
    createdById: t.createdById ?? null,
    resolvedAt: t.resolvedAt ?? null,
    closedAt: t.closedAt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function mapMessage(m: any) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    authorId: m.authorId ?? null,
    authorName: m.author ? m.author.fullName || m.author.email : null,
    authorRole: m.authorRole,
    body: m.body,
    createdAt: m.createdAt,
  };
}

// GET /api/admin/tickets/summary
router.get("/summary", async (_req: Request, res: Response) => {
  const grouped = await prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<string, number> = { open: 0, pending: 0, resolved: 0, closed: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  res.json({ counts, openTotal: counts.open + counts.pending });
});

// GET /api/admin/tickets
router.get("/", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const status = queryStr(req, "status") || "active";
  const q = queryStr(req, "q");
  const priority = queryStr(req, "priority");
  const assignee = queryStr(req, "assignee");
  const where: any = {};

  if (status === "active") where.status = { in: ["open", "pending"] };
  else if (status !== "all") {
    if (!TICKET_STATUSES.includes(status as any)) throw new AppError("Unknown ticket status filter", 400);
    where.status = status;
  }
  if (priority && TICKET_PRIORITIES.includes(priority as any)) where.priority = priority;
  if (assignee === "me") where.assigneeId = req.user!.userId;
  else if (assignee === "unassigned") where.assigneeId = null;
  else if (assignee && isUuid(assignee)) where.assigneeId = assignee;
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: q } } },
      ...(isUuid(q) ? [{ id: q }, { customerId: q }] : []),
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: page.skip,
      take: page.take,
      include: TICKET_INCLUDE,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  res.json(paged(rows.map(mapTicket), total, page));
});

// POST /api/admin/tickets
router.post("/", async (req: Request, res: Response) => {
  const customerId = requireUuid(str(req.body?.customerId), "customer id");
  const subject = str(req.body?.subject);
  const category = str(req.body?.category) || "other";
  const priority = str(req.body?.priority) || "medium";
  const body = str(req.body?.body);

  if (subject.length < 3 || subject.length > 200) throw new AppError("Subject must be 3–200 characters", 400);
  if (!TICKET_CATEGORIES.includes(category as any)) throw new AppError("Invalid category", 400);
  if (!TICKET_PRIORITIES.includes(priority as any)) throw new AppError("Invalid priority", 400);

  const customer = await prisma.user.findFirst({ where: { id: customerId, role: "user" } });
  if (!customer) throw new AppError("Customer not found", 404);

  const ticket = await prisma.supportTicket.create({
    data: {
      customerId,
      subject,
      category,
      priority,
      status: "open",
      createdById: req.user!.userId,
      ...(body
        ? { messages: { create: { authorId: req.user!.userId, authorRole: "staff", body } } }
        : {}),
    },
    include: TICKET_INCLUDE,
  });

  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "ticket.created", entityType: "support_ticket", entityId: ticket.id,
    metadata: { customerId, subject, category, priority },
  });

  res.status(201).json({ ok: true, ticket: mapTicket(ticket) });
});

// GET /api/admin/tickets/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "ticket id");
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      ...TICKET_INCLUDE,
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true, email: true } } },
      },
    },
  });
  if (!ticket) throw new AppError("Ticket not found", 404);

  const history = await prisma.auditEvent.findMany({
    where: { entityType: "support_ticket", entityId: id },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    ticket: mapTicket(ticket),
    messages: ticket.messages.map(mapMessage),
    history: history.map((h) => ({ id: h.id, action: h.action, actorId: h.actorId, metadata: h.metadata, createdAt: h.createdAt })),
  });
});

// POST /api/admin/tickets/:id/messages
router.post("/:id/messages", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "ticket id");
  const body = str(req.body?.body);
  if (!body) throw new AppError("Message body is required", 400);
  if (body.length > 5000) throw new AppError("Message is too long (max 5000 characters)", 400);

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError("Ticket not found", 404);
  if (ticket.status === "closed") throw new AppError("Reopen the ticket before replying", 409);

  const message = await prisma.ticketMessage.create({
    data: { ticketId: id, authorId: req.user!.userId, authorRole: "staff", body },
    include: { author: { select: { fullName: true, email: true } } },
  });

  // A staff reply means the ball is in the customer's court.
  const nextStatus = ticket.status === "open" ? "pending" : ticket.status;
  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { status: nextStatus, updatedAt: new Date() },
    include: TICKET_INCLUDE,
  });

  res.status(201).json({ ok: true, message: mapMessage(message), ticket: mapTicket(updated) });
});

// PATCH /api/admin/tickets/:id — status / priority / category / assignee / subject.
router.patch("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "ticket id");
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError("Ticket not found", 404);

  const data: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (req.body?.status !== undefined) {
    const v = str(req.body.status);
    if (!TICKET_STATUSES.includes(v as any)) throw new AppError("Invalid status", 400);
    if (v !== ticket.status) {
      data.status = v;
      changes.status = { from: ticket.status, to: v };
      if (v === "resolved") data.resolvedAt = new Date();
      if (v === "closed") data.closedAt = new Date();
      if (v === "open" || v === "pending") { data.resolvedAt = null; data.closedAt = null; }
    }
  }
  if (req.body?.priority !== undefined) {
    const v = str(req.body.priority);
    if (!TICKET_PRIORITIES.includes(v as any)) throw new AppError("Invalid priority", 400);
    if (v !== ticket.priority) { data.priority = v; changes.priority = { from: ticket.priority, to: v }; }
  }
  if (req.body?.category !== undefined) {
    const v = str(req.body.category);
    if (!TICKET_CATEGORIES.includes(v as any)) throw new AppError("Invalid category", 400);
    if (v !== ticket.category) { data.category = v; changes.category = { from: ticket.category, to: v }; }
  }
  if (req.body?.subject !== undefined) {
    const v = str(req.body.subject);
    if (v.length < 3 || v.length > 200) throw new AppError("Subject must be 3–200 characters", 400);
    if (v !== ticket.subject) { data.subject = v; changes.subject = { from: ticket.subject, to: v }; }
  }
  if (req.body?.assigneeId !== undefined) {
    const raw = req.body.assigneeId;
    const v: string | null = raw === null || raw === "" ? null : requireUuid(str(raw), "assignee id");
    if (v) {
      const staff = await prisma.user.findFirst({ where: { id: v, role: "admin", deletedAt: null } });
      if (!staff) throw new AppError("Assignee must be an active staff member", 400);
    }
    if (v !== (ticket.assigneeId ?? null)) { data.assigneeId = v; changes.assigneeId = { from: ticket.assigneeId, to: v }; }
  }

  if (Object.keys(data).length === 0) {
    const current = await prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: TICKET_INCLUDE });
    res.json({ ok: true, ticket: mapTicket(current), changed: [] });
    return;
  }

  const updated = await prisma.supportTicket.update({ where: { id }, data, include: TICKET_INCLUDE });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: changes.status ? `ticket.${String(changes.status.to)}` : "ticket.updated",
    entityType: "support_ticket", entityId: id,
    metadata: { changes },
  });

  res.json({ ok: true, ticket: mapTicket(updated), changed: Object.keys(changes) });
});

export default router;
