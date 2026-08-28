import { Prisma, type CreditProduct, type Partner, type PartnerLocation } from "@prisma/client";
import prisma from "./prisma.js";
import { localQuote } from "./pricing.js";
import { effectiveCreditEvidence } from "./credit-evidence.js";
import { evaluateUnderwriting } from "./underwriting.js";
import { AppError } from "../middleware/error-handler.js";
import { writeAuditEvent } from "./audit.js";

const OPEN_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];

function money(value: number, label: string, allowZero = false): number {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new AppError(`${label} must be a valid ${allowZero ? "non-negative" : "positive"} amount`, 400);
  }
  return amount;
}

export interface PartnerApplicationInput {
  userId: string;
  marketCode: string;
  product: CreditProduct;
  partner: Partner;
  location: PartnerLocation | null;
  amount: number;
  purpose: string;
  invoiceReference: string;
  externalReference: string | null;
  termDays: number;
  declaredMonthlyIncome: number;
  declaredMonthlyExpenses: number;
  existingDebtPayment: number;
}

export async function createPartnerFinancingApplication(input: PartnerApplicationInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  if (!user.phoneVerified) throw new AppError("Verify your phone before requesting credit", 403);
  if (!user.kycVerified) throw new AppError("Complete identity verification before requesting credit", 403);

  if (input.termDays < input.product.minTermDays || input.termDays > input.product.maxTermDays) {
    throw new AppError(`Term must be between ${input.product.minTermDays} and ${input.product.maxTermDays} days`, 400);
  }
  const requestedAmount = money(input.amount, "Financing amount");
  const declaredMonthlyIncome = money(input.declaredMonthlyIncome, "Monthly income");
  const declaredMonthlyExpenses = money(input.declaredMonthlyExpenses, "Monthly expenses", true);
  const existingDebtPayment = money(input.existingDebtPayment, "Existing debt payment", true);

  const [open, evidence, growthLine] = await Promise.all([
    prisma.loanApplication.findFirst({
      where: { applicantId: input.userId, status: { in: OPEN_STATUSES } },
      select: { id: true, status: true },
    }),
    effectiveCreditEvidence(input.userId),
    prisma.growthLine.findUnique({ where: { userId: input.userId } }),
  ]);
  if (open) throw new AppError(`You already have an open credit facility or application (${open.status})`, 409);
  if (!growthLine || growthLine.marketCode !== input.marketCode || growthLine.status !== "available" || growthLine.expiresAt <= new Date()) {
    throw new AppError("Your Kuula Growth Line is not currently available for a new financing request", 409);
  }
  if (requestedAmount > Number(growthLine.availableLimit)) {
    throw new AppError("Requested amount exceeds your available Kuula Growth Line", 422);
  }

  let quote;
  try {
    quote = localQuote(requestedAmount, input.termDays);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Could not price this financing request", 400);
  }

  const underwriting = evaluateUnderwriting({
    requestedAmount: quote.principal,
    totalRepayment: quote.total,
    termDays: quote.termDays,
    declaredMonthlyIncome,
    declaredMonthlyExpenses,
    existingDebtPayment,
    verifiedMonthlyIncome: null,
    phoneVerified: user.phoneVerified,
    kycVerified: user.kycVerified,
    evidence,
    loansRepaid: user.loansRepaid,
    loansTotal: user.loansTotal,
  });
  if (!underwriting.approved) {
    throw new AppError(`Request does not meet current lending criteria: ${underwriting.flags.join(", ")}`, 422);
  }
  if (quote.principal > underwriting.approvedLimit) {
    throw new AppError("Requested amount exceeds the current underwritten credit limit", 422);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.loanApplication.create({
        data: {
          applicantId: input.userId,
          applicantName: user.fullName,
          amount: BigInt(quote.principal),
          purpose: `${input.product.name}: ${input.purpose}`.slice(0, 120),
          termDays: quote.termDays,
          channel: "DIRECT_PAYEE",
          disbursementMethod: "direct_payee",
          apr: quote.apr,
          interest: BigInt(quote.interest),
          total: BigInt(quote.total),
          status: "pending",
        },
      });
      await tx.underwritingAssessment.create({
        data: {
          applicationId: application.id,
          userId: input.userId,
          declaredMonthlyIncome: BigInt(declaredMonthlyIncome),
          declaredMonthlyExpenses: BigInt(declaredMonthlyExpenses),
          existingDebtPayment: BigInt(existingDebtPayment),
          disposableIncome: BigInt(underwriting.disposableIncome),
          maxAffordablePayment: BigInt(underwriting.maxAffordablePayment),
          creditScore: underwriting.creditScore,
          approvedLimit: BigInt(underwriting.approvedLimit),
          status: underwriting.status,
          flags: underwriting.flags as Prisma.InputJsonValue,
        },
      });
      const request = await tx.partnerFinancingRequest.create({
        data: {
          userId: input.userId,
          marketCode: input.marketCode,
          partnerId: input.partner.id,
          partnerLocationId: input.location?.id ?? null,
          productId: input.product.id,
          externalReference: input.externalReference,
          invoiceReference: input.invoiceReference,
          purpose: input.purpose,
          amount: BigInt(quote.principal),
          status: "credit_review",
          payeeName: input.location?.name ?? input.partner.name,
          payeeReference: input.location?.externalReference ?? input.partner.code,
          loanApplicationId: application.id,
          metadata: {
            directPayeeRequired: true,
            disbursementMode: input.product.disbursementMode,
            source: "kuula-app",
            invoiceVerified: false,
            payeeVerified: false,
            requestedTermDays: quote.termDays,
            growthLineLimitAtApplication: Number(growthLine.availableLimit),
          },
        },
      });
      return { application, request };
    });

    await Promise.all([
      writeAuditEvent({
        actorId: input.userId,
        subjectUserId: input.userId,
        action: "partner_financing.submitted",
        resourceType: "partner_financing_request",
        resourceId: result.request.id,
        metadata: { applicationId: result.application.id, productCode: input.product.code, partnerCode: input.partner.code, amount: quote.principal, invoiceReference: input.invoiceReference },
      }),
      writeAuditEvent({
        actorId: input.userId,
        subjectUserId: input.userId,
        action: "loan.application_submitted",
        resourceType: "loan_application",
        resourceId: result.application.id,
        metadata: { amount: quote.principal, termDays: quote.termDays, purpose: input.product.name, disbursementMode: "direct_payee" },
      }),
    ]);
    return { ...result, underwriting };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new AppError(input.externalReference ? "This partner request was already submitted or you already have an open credit application" : "You already have an open credit application", 409);
    }
    throw error;
  }
}
