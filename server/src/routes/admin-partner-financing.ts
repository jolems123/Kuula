import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("loan.approve"));

interface DestinationRow {
  id: string;
  beneficiary_reference: string;
  account_tier: string | null;
  max_single_amount: bigint;
  max_daily_amount: bigint | null;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

router.get("/", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const requests = await prisma.partnerFinancingRequest.findMany({
    where: status ? { status } : { status: { in: ["credit_review", "payee_verified", "offered", "disbursing", "active", "overdue"] } },
    include: {
      user: { select: { id: true, fullName: true, phone: true, kycVerified: true } },
      partner: true,
      partnerLocation: true,
      product: true,
      loanApplication: { include: { underwriting: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 250,
  });
  res.json({
    requests: requests.map((item) => ({
      id: item.id,
      status: item.status,
      customer: item.user,
      partner: { id: item.partner.id, code: item.partner.code, name: item.partner.name, type: item.partner.partnerType },
      location: item.partnerLocation ? { id: item.partnerLocation.id, name: item.partnerLocation.name, district: item.partnerLocation.district } : null,
      product: { code: item.product.code, name: item.product.name, category: item.product.category },
      purpose: item.purpose,
      invoiceReference: item.invoiceReference,
      amount: Number(item.amount),
      payeeName: item.payeeName,
      metadata: item.metadata,
      application: item.loanApplication ? {
        id: item.loanApplication.id,
        status: item.loanApplication.status,
        termDays: item.loanApplication.termDays,
        creditScore: item.loanApplication.underwriting?.creditScore ?? null,
        approvedLimit: item.loanApplication.underwriting ? Number(item.loanApplication.underwriting.approvedLimit) : null,
      } : null,
      createdAt: item.createdAt,
    })),
  });
});

router.post("/:id/verify-payee", async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  const network = String(req.body?.network || "").trim().toLowerCase();
  const note = String(req.body?.note || "").trim().slice(0, 1200);
  if (!/^(mtn|airtel)$/.test(network)) throw new AppError("Network must be MTN or Airtel", 400);
  if (note.length < 20) throw new AppError("Record how the invoice and partner settlement destination were verified", 400);

  let settlementReference: string;
  try {
    settlementReference = normalizeUgandaMobileMoneyPhone(String(req.body?.settlementReference || ""));
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "A valid partner Mobile Money destination is required", 400);
  }

  const request = await prisma.partnerFinancingRequest.findUnique({
    where: { id },
    include: { partner: true, partnerLocation: true, loanApplication: true },
  });
  if (!request || !request.loanApplicationId || !request.loanApplication) throw new AppError("Linked partner credit application not found", 404);
  if (!["credit_review", "payee_verified"].includes(request.status)) throw new AppError("This partner request is no longer awaiting payee verification", 409);
  if (!["pending", "resubmitted"].includes(request.loanApplication.status)) throw new AppError("Payee verification must be completed before the customer offer is created", 409);
  if (!request.invoiceReference) throw new AppError("Invoice/order reference is missing", 409);

  const destinations = await prisma.$queryRaw<DestinationRow[]>(Prisma.sql`
    SELECT id, beneficiary_reference, account_tier, max_single_amount, max_daily_amount
    FROM payment_destination_profiles
    WHERE market_code=${request.marketCode}
      AND provider='marzpay'
      AND network=${network}
      AND beneficiary_type='partner'
      AND beneficiary_reference=${settlementReference}
      AND status='verified'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY verified_at DESC
    LIMIT 1
  `);
  const destination = destinations[0];
  if (!destination) {
    throw new AppError("This partner settlement destination has not been independently verified in Payment Provider Limits", 409);
  }

  // Four-eyes control: the staff identity that created/verified the payout
  // destination cannot be the identity that binds it to a customer's facility.
  const destinationAudit = await prisma.auditEvent.findFirst({
    where: {
      resourceType: "payment_destination_profile",
      resourceId: destination.id,
      action: "payment.destination_limit_verified",
    },
    orderBy: { createdAt: "desc" },
    select: { actorId: true, createdAt: true },
  });
  if (!destinationAudit?.actorId) {
    throw new AppError("The payout destination is missing independent verification provenance and cannot be used", 409);
  }
  if (destinationAudit.actorId === req.user!.userId) {
    throw new AppError("A second authorized staff member must verify use of this payout destination", 409);
  }

  const metadata = {
    ...jsonObject(request.metadata),
    invoiceVerified: true,
    payeeVerified: true,
    settlementProvider: "marzpay",
    settlementNetwork: network,
    settlementReference,
    destinationProfileId: destination.id,
    destinationVerifiedBy: destinationAudit.actorId,
    verifiedAt: new Date().toISOString(),
    verifiedBy: req.user!.userId,
    verificationNote: note,
  };

  await prisma.$transaction([
    prisma.partnerFinancingRequest.update({
      where: { id: request.id },
      data: { status: "payee_verified", metadata: metadata as Prisma.InputJsonValue },
    }),
    prisma.notification.create({
      data: {
        userId: request.userId,
        title: "Partner details verified",
        body: `${request.payeeName} and invoice ${request.invoiceReference} have been verified. Your credit application continues through review.`,
        type: "info",
      },
    }),
  ]);

  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: request.userId,
    action: "partner_financing.payee_verified",
    resourceType: "partner_financing_request",
    resourceId: request.id,
    metadata: {
      applicationId: request.loanApplicationId,
      partnerId: request.partnerId,
      partnerLocationId: request.partnerLocationId,
      invoiceReference: request.invoiceReference,
      network,
      settlementMasked: `${settlementReference.slice(0, 7)}****${settlementReference.slice(-2)}`,
      destinationProfileId: destination.id,
      destinationVerifiedBy: destinationAudit.actorId,
      note,
    },
  });
  res.json({ ok: true, status: "payee_verified", destinationProfileId: destination.id });
});

export default router;
