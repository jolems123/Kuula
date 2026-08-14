import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { effectiveCreditEvidence } from "../lib/credit-evidence.js";
import { evaluateUnderwriting } from "../lib/underwriting.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import {
  createCustomerDisbursementBatch,
  dispatchNextDisbursementLeg,
  disbursementBatchForApplication,
  resetFailedLegForRetry,
} from "../lib/disbursements.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

async function recheck(application: any) {
  if (!application.underwriting) throw new AppError("Loan underwriting record is missing", 409);
  const user = application.applicant;
  const evidence = await effectiveCreditEvidence(user.id);
  const assessment = application.underwriting;
  const result = evaluateUnderwriting({
    requestedAmount: Number(application.amount),
    totalRepayment: Number(application.total),
    termDays: application.termDays,
    declaredMonthlyIncome: Number(assessment.declaredMonthlyIncome),
    declaredMonthlyExpenses: Number(assessment.declaredMonthlyExpenses),
    existingDebtPayment: Number(assessment.existingDebtPayment),
    verifiedMonthlyIncome: assessment.verifiedMonthlyIncome == null ? null : Number(assessment.verifiedMonthlyIncome),
    phoneVerified: user.phoneVerified,
    kycVerified: user.kycVerified,
    evidence,
    loansRepaid: user.loansRepaid,
    loansTotal: user.loansTotal,
  });
  await prisma.underwritingAssessment.update({
    where: { applicationId: application.id },
    data: {
      disposableIncome: BigInt(result.disposableIncome),
      maxAffordablePayment: BigInt(result.maxAffordablePayment),
      creditScore: result.creditScore,
      approvedLimit: BigInt(result.approvedLimit),
      status: result.status,
      flags: result.flags as Prisma.InputJsonValue,
      assessedAt: new Date(),
      assessedBy: null,
    },
  });
  if (!result.approved) throw new AppError(`Loan is no longer eligible: ${result.flags.join(", ")}`, 422);
}

router.post("/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const applicationId = String(req.params.id || "");
  const userId = req.user!.userId;
  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { applicant: true, underwriting: true, agreementAcceptance: true, partnerFinancing: true },
  });
  if (!application || application.applicantId !== userId) throw new AppError("Loan offer not found", 404);
  if (application.partnerFinancing) {
    throw new AppError("Restricted-purpose financing must be paid directly to the verified partner, not to the customer Mobile Money account", 409);
  }

  const existingBatch = await disbursementBatchForApplication(applicationId);
  if (existingBatch) {
    res.json({
      application: { id: application.id, status: application.status },
      disbursement: existingBatch,
      message: existingBatch.status === "settled" ? "Disbursement is complete." : "Disbursement is already being processed.",
    });
    return;
  }

  if (application.status !== "offered") throw new AppError("Only offered loans can be accepted", 409);
  if (!application.offerExpiresAt || application.offerExpiresAt <= new Date()) throw new AppError("This loan offer has expired", 409);
  if (!application.agreementAcceptance) throw new AppError("Accept the loan agreement before requesting disbursement", 409);
  await recheck(application);

  const phone = normalizeUgandaMobileMoneyPhone(application.applicant.phone || "");
  const loanId = application.loanId || application.id;
  const amount = Number(application.amount);

  const claimed = await prisma.loanApplication.updateMany({
    where: { id: application.id, applicantId: userId, status: "offered", acceptedAt: null, offerExpiresAt: { gt: new Date() } },
    data: { status: "disbursing", acceptedAt: new Date(), loanId },
  });
  if (claimed.count !== 1) throw new AppError("This loan offer is already being processed or has expired", 409);

  let plan;
  try {
    plan = await createCustomerDisbursementBatch({
      applicationId: application.id,
      userId,
      loanId,
      phone,
      amount,
      channel: application.channel,
    });
  } catch (error) {
    await prisma.loanApplication.updateMany({
      where: { id: application.id, status: "disbursing", loanId },
      data: { status: "offered", acceptedAt: null },
    });
    throw error;
  }

  const first = await dispatchNextDisbursementLeg(plan.batchId);
  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "loan.disbursement_batch_started",
    resourceType: "loan_application",
    resourceId: application.id,
    metadata: {
      batchId: plan.batchId,
      approvedAmount: amount,
      network: plan.network,
      maxSingleAmount: plan.maxSingleAmount,
      legAmounts: plan.legs,
      firstReference: first.reference ?? null,
    },
  });

  const batch = await disbursementBatchForApplication(application.id);
  res.json({
    application: { id: application.id, status: "disbursing" },
    disbursement: batch,
    message: first.dispatched
      ? `Disbursement started in ${plan.legs.length} provider-safe transaction${plan.legs.length === 1 ? "" : "s"}.`
      : `Disbursement requires attention: ${first.reason || "provider request was not accepted"}`,
  });
});

router.get("/:id/disbursement", authenticateToken, async (req: Request, res: Response) => {
  const application = await prisma.loanApplication.findUnique({
    where: { id: String(req.params.id || "") },
    select: { id: true, applicantId: true, status: true },
  });
  if (!application) throw new AppError("Loan application not found", 404);
  const isStaff = ["admin", "manager", "officer"].includes(req.user!.role);
  if (!isStaff && application.applicantId !== req.user!.userId) throw new AppError("Loan application not found", 404);
  const batch = await disbursementBatchForApplication(application.id);
  res.json({ applicationStatus: application.status, disbursement: batch });
});

router.post("/:id/disbursement/retry", authenticateToken, requirePermissions("reconciliation.manage"), async (req: Request, res: Response) => {
  const applicationId = String(req.params.id || "");
  const batch = await disbursementBatchForApplication(applicationId);
  if (!batch) throw new AppError("Disbursement batch not found", 404);
  await resetFailedLegForRetry(batch.id);
  const result = await dispatchNextDisbursementLeg(batch.id);
  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "loan.disbursement_leg_retried",
    resourceType: "loan_application",
    resourceId: applicationId,
    metadata: { batchId: batch.id, reference: result.reference ?? null, reason: result.reason ?? null },
  });
  res.json({ ok: result.dispatched, result, disbursement: await disbursementBatchForApplication(applicationId) });
});

export default router;
