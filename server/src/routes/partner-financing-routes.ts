import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { createPartnerFinancingApplication } from "../lib/partner-financing.js";
import { effectiveCreditEvidence } from "../lib/credit-evidence.js";
import { evaluateUnderwriting } from "../lib/underwriting.js";
import {
  createVerifiedPartnerDisbursementBatch,
  dispatchNextDisbursementLeg,
  disbursementBatchForApplication,
} from "../lib/partner-disbursements.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

function text(value: unknown, label: string, max = 180): string {
  const result = String(value ?? "").trim().slice(0, max);
  if (!result) throw new AppError(`${label} is required`, 400);
  return result;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

router.post("/partner-financing", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const marketCode = String(req.body?.marketCode ?? "UG").trim().toUpperCase().slice(0, 3);
  const productCode = text(req.body?.productCode, "Credit product", 80);
  const partnerCode = text(req.body?.partnerCode, "Partner", 80);
  const invoiceReference = text(req.body?.invoiceReference, "Invoice/order reference", 160);
  const purpose = text(req.body?.purpose, "Financing purpose", 240);
  const partnerLocationId = req.body?.partnerLocationId ? String(req.body.partnerLocationId).trim() : null;
  const externalReference = req.body?.externalReference ? String(req.body.externalReference).trim().slice(0, 180) : null;
  const amount = Math.round(Number(req.body?.amount));
  const termDays = Math.round(Number(req.body?.termDays));
  const declaredMonthlyIncome = Math.round(Number(req.body?.declaredMonthlyIncome));
  const declaredMonthlyExpenses = Math.round(Number(req.body?.declaredMonthlyExpenses));
  const existingDebtPayment = Math.round(Number(req.body?.existingDebtPayment ?? 0));

  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("A valid financing amount is required", 400);
  if (!Number.isFinite(termDays) || termDays <= 0) throw new AppError("A valid financing term is required", 400);

  const [market, product, partner] = await Promise.all([
    prisma.market.findUnique({ where: { code: marketCode } }),
    prisma.creditProduct.findUnique({ where: { code: productCode } }),
    prisma.partner.findUnique({ where: { code: partnerCode }, include: { locations: true } }),
  ]);
  if (!market || market.status !== "active") throw new AppError("This Kuula market is not active", 404);
  if (!product || product.marketCode !== marketCode || product.status !== "active") throw new AppError("Credit product is unavailable", 404);
  if (!product.partnerRequired || product.disbursementMode !== "direct_payee") throw new AppError("This endpoint is only for restricted-purpose direct-payee credit", 400);
  if (!partner || partner.marketCode !== marketCode || partner.status !== "active") throw new AppError("Partner is unavailable", 404);

  const productCodes = Array.isArray((partner.metadata as any)?.productCodes) ? (partner.metadata as any).productCodes.map(String) : [];
  if (productCodes.length > 0 && !productCodes.includes(product.code)) throw new AppError("Selected partner does not support this credit product", 400);
  if (amount < Number(product.minAmount) || amount > Number(product.maxAmount)) {
    throw new AppError(`Amount must be between ${Number(product.minAmount)} and ${Number(product.maxAmount)}`, 400);
  }

  const location = partnerLocationId
    ? partner.locations.find((entry) => entry.id === partnerLocationId && entry.active) ?? null
    : null;
  if (partnerLocationId && !location) throw new AppError("Partner location is unavailable", 404);

  const result = await createPartnerFinancingApplication({
    userId,
    marketCode,
    product,
    partner,
    location,
    amount,
    purpose,
    invoiceReference,
    externalReference,
    termDays,
    declaredMonthlyIncome,
    declaredMonthlyExpenses,
    existingDebtPayment,
  });

  res.status(201).json({
    request: {
      id: result.request.id,
      status: result.request.status,
      amount: Number(result.request.amount),
      partner: partner.name,
      partnerLocation: location?.name ?? null,
      product: product.name,
      applicationId: result.application.id,
      applicationStatus: result.application.status,
      underwritingStatus: result.underwriting.status,
      message: "Credit application created. Kuula will complete field/reviewer checks and verify the invoice and payee before an offer can be issued.",
    },
  });
});

router.post("/partner-financing/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const request = await prisma.partnerFinancingRequest.findUnique({
    where: { id: String(req.params.id || "") },
    include: {
      partner: true,
      partnerLocation: true,
      product: true,
      loanApplication: {
        include: { applicant: true, underwriting: true, agreementAcceptance: true },
      },
    },
  });
  if (!request || request.userId !== userId || !request.loanApplication) throw new AppError("Partner credit offer not found", 404);

  const application = request.loanApplication;
  const existingBatch = await disbursementBatchForApplication(application.id);
  if (existingBatch) {
    res.json({
      requestId: request.id,
      applicationId: application.id,
      applicationStatus: application.status,
      payee: request.payeeName,
      disbursement: existingBatch,
      message: existingBatch.status === "settled"
        ? `Settlement to ${request.payeeName} is complete.`
        : `Settlement to ${request.payeeName} is already being processed.`,
    });
    return;
  }

  if (application.status !== "offered") throw new AppError("Only an offered partner-credit facility can be accepted", 409);
  if (!application.offerExpiresAt || application.offerExpiresAt <= new Date()) throw new AppError("This credit offer has expired", 409);
  if (!application.agreementAcceptance) throw new AppError("Accept the credit agreement before requesting partner settlement", 409);
  if (!application.underwriting) throw new AppError("Credit underwriting record is missing", 409);

  const metadata = jsonObject(request.metadata);
  if (request.status !== "offered" && request.status !== "payee_verified") {
    throw new AppError("Partner settlement details are not ready", 409);
  }
  if (metadata.invoiceVerified !== true || metadata.payeeVerified !== true) throw new AppError("Invoice and partner settlement destination must be verified", 409);
  const destinationProfileId = String(metadata.destinationProfileId || "");
  const settlementReference = String(metadata.settlementReference || "");
  const settlementNetwork = String(metadata.settlementNetwork || "") as "mtn" | "airtel";
  if (!destinationProfileId || !settlementReference || !["mtn", "airtel"].includes(settlementNetwork)) {
    throw new AppError("Verified partner settlement details are incomplete", 409);
  }

  const evidence = await effectiveCreditEvidence(userId);
  const assessment = application.underwriting;
  const current = evaluateUnderwriting({
    requestedAmount: Number(application.amount),
    totalRepayment: Number(application.total),
    termDays: application.termDays,
    declaredMonthlyIncome: Number(assessment.declaredMonthlyIncome),
    declaredMonthlyExpenses: Number(assessment.declaredMonthlyExpenses),
    existingDebtPayment: Number(assessment.existingDebtPayment),
    verifiedMonthlyIncome: assessment.verifiedMonthlyIncome == null ? null : Number(assessment.verifiedMonthlyIncome),
    phoneVerified: application.applicant.phoneVerified,
    kycVerified: application.applicant.kycVerified,
    evidence,
    loansRepaid: application.applicant.loansRepaid,
    loansTotal: application.applicant.loansTotal,
  });
  await prisma.underwritingAssessment.update({
    where: { applicationId: application.id },
    data: {
      disposableIncome: BigInt(current.disposableIncome),
      maxAffordablePayment: BigInt(current.maxAffordablePayment),
      creditScore: current.creditScore,
      approvedLimit: BigInt(current.approvedLimit),
      status: current.status,
      flags: current.flags as Prisma.InputJsonValue,
      assessedAt: new Date(),
      assessedBy: null,
    },
  });
  if (!current.approved) throw new AppError(`Credit is no longer eligible: ${current.flags.join(", ")}`, 422);

  const loanId = application.loanId || application.id;
  const claimed = await prisma.loanApplication.updateMany({
    where: { id: application.id, applicantId: userId, status: "offered", acceptedAt: null, offerExpiresAt: { gt: new Date() } },
    data: { status: "disbursing", acceptedAt: new Date(), loanId },
  });
  if (claimed.count !== 1) throw new AppError("This credit offer is already being processed or has expired", 409);

  let plan;
  try {
    plan = await createVerifiedPartnerDisbursementBatch({
      applicationId: application.id,
      userId,
      loanId,
      marketCode: request.marketCode,
      amount: Number(application.amount),
      destinationProfileId,
      expectedReference: settlementReference,
      expectedNetwork: settlementNetwork,
    });
  } catch (error) {
    await prisma.loanApplication.updateMany({
      where: { id: application.id, status: "disbursing", loanId },
      data: { status: "offered", acceptedAt: null },
    });
    throw error;
  }

  const first = await dispatchNextDisbursementLeg(plan.batchId);
  await prisma.partnerFinancingRequest.update({ where: { id: request.id }, data: { status: "disbursing" } });
  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "partner_financing.disbursement_started",
    resourceType: "partner_financing_request",
    resourceId: request.id,
    metadata: {
      applicationId: application.id,
      batchId: plan.batchId,
      partnerId: request.partnerId,
      payeeName: request.payeeName,
      invoiceReference: request.invoiceReference,
      amount: Number(application.amount),
      network: plan.network,
      legAmounts: plan.legs,
      firstReference: first.reference ?? null,
    },
  });

  res.json({
    requestId: request.id,
    applicationId: application.id,
    applicationStatus: "disbursing",
    payee: request.payeeName,
    disbursement: await disbursementBatchForApplication(application.id),
    message: first.dispatched
      ? `Settlement to ${request.payeeName} has started.`
      : `Partner settlement requires attention: ${first.reason || "provider request was not accepted"}`,
  });
});

export default router;
