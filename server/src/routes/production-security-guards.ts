import crypto from "node:crypto";
import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { parseMarzPayWebhook, secureTokenEquals, verifyMarzPayWebhookSignature } from "../lib/marzpay.js";

const router = Router();
const OPEN_FINANCIAL_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];
const CUSTOMER_ROLES = new Set(["user", "customer"]);

function isProductionMoney(): boolean {
  return process.env.NODE_ENV === "production" && process.env.REAL_MONEY_ENABLED === "true";
}

function header(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

async function requireCaseScope(applicationId: string, userId: string, role: string): Promise<void> {
  if (["admin", "administrator", "super_admin"].includes(role)) return;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM approval_assignments
    WHERE application_id=${applicationId}::uuid
      AND assignee_id=${userId}::uuid
    LIMIT 1
  `);
  if (!rows[0]) throw new AppError("This credit case is outside your assigned workload", 403);
}

router.post("/payments/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  const event = parseMarzPayWebhook(req.body);
  const sharedSecret = process.env.MARZPAY_WEBHOOK_SECRET?.trim() || "";
  const headerToken = header(req, "x-webhook-token");
  const allowQueryToken = process.env.NODE_ENV === "test" || process.env.MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN === "true";
  const suppliedToken = headerToken || (allowQueryToken ? String(req.query.token || "") : "");
  const legacyTokenValid = Boolean(sharedSecret) && secureTokenEquals(suppliedToken, sharedSecret);

  // MarzPay signs `timestamp.raw_body` and sends the signature as
  // `X-MarzPay-Signature: t=<timestamp>,v1=<hex>`. Keep legacy token support
  // for sandbox callbacks, but require the provider signature for live money.
  const signatureSecret = process.env.MARZPAY_WEBHOOK_SIGNATURE_SECRET?.trim() || "";
  const timestamp = header(req, "x-marzpay-timestamp");
  const signatureHeader = header(req, "x-marzpay-signature");
  const rawBody = req.rawBody;
  const signatureValid = verifyMarzPayWebhookSignature({
    rawBody: rawBody || Buffer.alloc(0),
    timestamp,
    signatureHeader,
    secret: signatureSecret,
  });

  if (isProductionMoney() && !signatureValid) {
    res.status(401).json({ error: "A valid MarzPay webhook signature is required" });
    return;
  }
  if (!isProductionMoney() && !signatureValid && !legacyTokenValid) {
    res.status(401).json({ error: "Invalid webhook authentication" });
    return;
  }

  if (isProductionMoney()) {
    const eventId = `${event.eventType || "transaction"}:${event.uuid || event.reference}:${event.status}`;
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(eventId)) {
      res.status(400).json({ error: "Webhook event id is invalid" });
      return;
    }
    if (!rawBody?.length) {
      res.status(400).json({ error: "Raw webhook body is unavailable for signature verification" });
      return;
    }

    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const existing = await prisma.$queryRaw<Array<{ payload_hash: string }>>(Prisma.sql`
      SELECT payload_hash
      FROM webhook_receipts
      WHERE provider='marzpay' AND event_id=${eventId}
      LIMIT 1
    `);
    if (existing[0]) {
      if (existing[0].payload_hash !== payloadHash) {
        res.status(409).json({ error: "Webhook event id was reused with a different payload" });
        return;
      }
      // An already-completed provider event is acknowledged idempotently so the
      // provider stops retrying. Downstream financial state has already been
      // protected by transaction-level settlement claims.
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    // Record the replay receipt only after downstream handling succeeds. A
    // transient validation/provider/database failure must remain retryable with
    // the same signed event id. Concurrent duplicates are still safe because
    // the settlement routes atomically claim only pending financial rows.
    res.once("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      void prisma.$executeRaw(Prisma.sql`
        INSERT INTO webhook_receipts (id, provider, event_id, payload_hash, received_at)
        VALUES (${crypto.randomUUID()}::uuid, 'marzpay', ${eventId}, ${payloadHash}, CURRENT_TIMESTAMP)
        ON CONFLICT (provider, event_id) DO NOTHING
      `).catch((error) => {
        console.error("Failed to persist completed MarZPay webhook receipt", error instanceof Error ? error.message : "unknown error");
      });
    });
  }

  if (isProductionMoney() && event.reference && event.isFinal && event.isSuccess) {
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

router.get("/operations/applications/:id", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  await requireCaseScope(String(req.params.id), req.user!.userId, req.user!.role);
  next();
});
router.use("/operations/applications/:id/messages", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  await requireCaseScope(String(req.params.id), req.user!.userId, req.user!.role);
  next();
});
router.get("/operations/evidence/:evidenceId/access", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  if (["admin", "administrator", "super_admin"].includes(req.user!.role)) return next();
  const rows = await prisma.$queryRaw<Array<{ application_id: string }>>(Prisma.sql`
    SELECT application_id FROM evaluation_evidence WHERE id=${String(req.params.evidenceId)}::uuid LIMIT 1
  `);
  if (!rows[0]) throw new AppError("Evidence not found", 404);
  await requireCaseScope(rows[0].application_id, req.user!.userId, req.user!.role);
  next();
});

router.use("/admin/kyc", authenticateToken, (req: Request, res: Response, next: NextFunction) => {
  if (["officer", "loan_officer"].includes(req.user!.role)) {
    res.status(403).json({ error: "KYC review requires an independent KYC reviewer" });
    return;
  }
  next();
});

router.post("/messages", authenticateToken, (req: Request, _res: Response, next: NextFunction) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > 2_000) throw new AppError("Message content must be between 1 and 2,000 characters", 400);
  if (CUSTOMER_ROLES.has(req.user!.role) && req.body && typeof req.body === "object") {
    delete req.body.receiverId;
  }
  next();
});

router.get("/transactions", authenticateToken, async (req: Request, res: Response) => {
  const where = hasPermission(req.user!.role, "reconciliation.manage") ? {} : { userId: req.user!.userId };
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
