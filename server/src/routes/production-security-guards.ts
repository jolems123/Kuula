import crypto from "node:crypto";
import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { parseMarzPayWebhook, secureTokenEquals } from "../lib/marzpay.js";

const router = Router();
const OPEN_FINANCIAL_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];

function isProductionMoney(): boolean {
  return process.env.NODE_ENV === "production" && process.env.REAL_MONEY_ENABLED === "true";
}

function header(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function safeEqualHex(actual: string, expected: string): boolean {
  const a = Buffer.from(actual.replace(/^sha256=/i, "").trim().toLowerCase(), "utf8");
  const e = Buffer.from(expected.trim().toLowerCase(), "utf8");
  return a.length === e.length && e.length > 0 && crypto.timingSafeEqual(a, e);
}

function webhookTimestampMs(value: string): number {
  if (/^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    return value.length === 10 ? numeric * 1000 : numeric;
  }
  return Date.parse(value);
}

async function requireCaseScope(applicationId: string, userId: string, role: string): Promise<void> {
  if (role === "admin") return;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM approval_assignments
    WHERE application_id=${applicationId}::uuid
      AND assignee_id=${userId}::uuid
    LIMIT 1
  `);
  if (!rows[0]) throw new AppError("This credit case is outside your assigned workload", 403);
}

// Strong webhook authenticity/replay gate. The existing webhook handlers still
// perform their own shared-token, amount and ledger checks; this guard adds a
// signed raw-body requirement for real-money production and a durable event-id
// replay barrier before any financial mutation can run.
router.post("/payments/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  const sharedSecret = process.env.MARZPAY_WEBHOOK_SECRET?.trim() || "";
  const suppliedToken = header(req, "x-webhook-token");
  if (!sharedSecret) {
    res.status(503).json({ error: "Webhook is not configured" });
    return;
  }
  if (!secureTokenEquals(suppliedToken, sharedSecret)) {
    res.status(401).json({ error: "Invalid webhook authentication" });
    return;
  }

  if (isProductionMoney()) {
    const signatureSecret = process.env.MARZPAY_WEBHOOK_SIGNATURE_SECRET?.trim() || "";
    const timestamp = header(req, "x-webhook-timestamp");
    const eventId = header(req, "x-webhook-id");
    const signature = header(req, "x-webhook-signature");
    if (!signatureSecret || !timestamp || !eventId || !signature) {
      res.status(401).json({ error: "Signed webhook headers are required" });
      return;
    }
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(eventId)) {
      res.status(400).json({ error: "Webhook event id is invalid" });
      return;
    }
    const timestampMs = webhookTimestampMs(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
      res.status(401).json({ error: "Webhook timestamp is outside the allowed replay window" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      res.status(400).json({ error: "Raw webhook body is unavailable for signature verification" });
      return;
    }
    const expectedSignature = crypto
      .createHmac("sha256", signatureSecret)
      .update(timestamp)
      .update(".")
      .update(eventId)
      .update(".")
      .update(rawBody)
      .digest("hex");
    if (!safeEqualHex(signature, expectedSignature)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO webhook_receipts (id, provider, event_id, payload_hash, received_at)
        VALUES (${crypto.randomUUID()}::uuid, 'marzpay', ${eventId}, ${crypto.createHash("sha256").update(rawBody).digest("hex")}, CURRENT_TIMESTAMP)
      `);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2010" || (error as { code?: string })?.code === "P2002") {
        res.status(409).json({ error: "Webhook event has already been processed" });
        return;
      }
      const message = error instanceof Error ? error.message : "";
      if (/unique|duplicate/i.test(message)) {
        res.status(409).json({ error: "Webhook event has already been processed" });
        return;
      }
      throw error;
    }
  }

  const event = parseMarzPayWebhook(req.body);
  if (event.reference && event.isFinal && event.isSuccess) {
    const transaction = await prisma.transaction.findUnique({
      where: { reference: event.reference },
      select: { transactionId: true },
    });
    if (transaction?.transactionId && (!event.uuid || event.uuid !== transaction.transactionId)) {
      res.status(409).json({ error: "Provider transaction identity is required and must match the initiated transaction" });
      return;
    }
  }
  next();
});

// Field/senior reviewers may only open cases they have actually been assigned.
// Admin retains portfolio-wide access for audit/supervision.
router.get("/operations/applications/:id", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  await requireCaseScope(String(req.params.id), req.user!.userId, req.user!.role);
  next();
});
router.use("/operations/applications/:id/messages", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  await requireCaseScope(String(req.params.id), req.user!.userId, req.user!.role);
  next();
});
router.get("/operations/evidence/:evidenceId/access", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  if (req.user!.role === "admin") return next();
  const rows = await prisma.$queryRaw<Array<{ application_id: string }>>(Prisma.sql`
    SELECT application_id FROM evaluation_evidence WHERE id=${String(req.params.evidenceId)}::uuid LIMIT 1
  `);
  if (!rows[0]) throw new AppError("Evidence not found", 404);
  await requireCaseScope(rows[0].application_id, req.user!.userId, req.user!.role);
  next();
});

// Ordinary field officers never receive global KYC review/document access.
router.use("/admin/kyc", authenticateToken, (req: Request, res: Response, next: NextFunction) => {
  if (req.user!.role === "officer") {
    res.status(403).json({ error: "KYC review requires an independent KYC reviewer" });
    return;
  }
  next();
});

// Prevent customer-to-customer abuse through the legacy support channel.
router.post("/messages", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > 3000) throw new AppError("Message content must be between 1 and 3000 characters", 400);
  if (req.user!.role !== "admin" && req.body?.receiverId) {
    const target = await prisma.user.findUnique({
      where: { id: String(req.body.receiverId) },
      select: { role: true, deletedAt: true },
    });
    if (!target || target.deletedAt || target.role !== "admin") {
      throw new AppError("Customers may only message Kuula support", 403);
    }
  }
  next();
});

// Return a strict transaction DTO; raw provider payloads and reconciliation
// internals never cross the customer API boundary.
router.get("/transactions", authenticateToken, async (req: Request, res: Response) => {
  const where = req.user!.role === "admin" ? {} : { userId: req.user!.userId };
  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      loanId: true,
      type: true,
      amount: true,
      status: true,
      reference: true,
      providerStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ transactions: transactions.map((row) => ({ ...row, amount: Number(row.amount) })) });
});

// Financial records are retained, but a borrower cannot disable credentials and
// repayment access while money is still owed or settlement is still in flight.
router.post("/users/me/delete", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const [openApplication, openRepayment, unsettledBatch] = await Promise.all([
    prisma.loanApplication.findFirst({
      where: { applicantId: userId, status: { in: OPEN_FINANCIAL_STATUSES } },
      select: { id: true, status: true },
    }),
    prisma.repayment.findFirst({
      where: { userId, status: { not: "paid" } },
      select: { id: true, status: true },
    }),
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM disbursement_batches
      WHERE user_id=${userId}::uuid AND status NOT IN ('settled','cancelled','failed')
      LIMIT 1
    `),
  ]);
  if (openApplication || openRepayment || unsettledBatch[0]) {
    throw new AppError("Account closure is unavailable while a credit application, disbursement, or repayment obligation remains open", 409);
  }
  next();
});

export default router;
