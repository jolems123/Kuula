import { assignInitialLoanOfficer } from "../lib/auto-assign-officer.js";
import { notifyLoanCustomer } from "../lib/loan-customer-notifications.js";
import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission, isStaffRole, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { assertBusinessPhotoEvidence } from "../lib/business-photo-review.js";
import { localQuote, type LoanQuote } from "../lib/pricing.js";
import { parseBusinessProfile, type BusinessProfile } from "../lib/business-profile.js";
import { effectiveCreditEvidence } from "../lib/credit-evidence.js";
import { evaluateUnderwriting, UNDERWRITING_POLICY } from "../lib/underwriting.js";
import { writeAuditEvent } from "../lib/audit.js";
import { isBusinessLoanPurpose } from "../lib/business-loan-purpose.js";
import { assertWithinApprovalAuthority } from "../lib/credit-authority.js";
import {
  buildMarzPayWebhookUrl,
  collectMoney,
  createPaymentReference,
  marzPayConfigured,
  normalizeMarzPayAmount,
  normalizeUgandaMobileMoneyPhone,
  sendMoney,
} from "../lib/marzpay.js";

const router = Router();
const OPEN_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];
const AGREEMENT_VERSION = "2026-08-01";

function quoteForRequest(amount: unknown, termDays: unknown): LoanQuote {
  try {
    return localQuote(Number(amount), Number(termDays));
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(error.message, 400);
    throw error;
  }
}

function money(value: unknown, label: string, allowZero = false): number {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0 || (!allowZero && normalized === 0)) {
    throw new AppError(`${label} must be a valid ${allowZero ? "non-negative" : "positive"} amount`, 400);
  }
  return normalized;
}

function providerCallbackUrl(): string {
  if (!marzPayConfigured()) throw new AppError("Mobile-money payments are not configured", 503);
  try {
    return buildMarzPayWebhookUrl();
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Payment callback is not configured", 503);
  }
}

function providerPhone(phone: string | null): string {
  try {
    return normalizeUgandaMobileMoneyPhone(phone || "");
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid mobile-money phone", 422);
  }
}

function providerAmount(amount: number): number {
  try {
    return normalizeMarzPayAmount(amount);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid mobile-money amount", 400);
  }
}

function jsonAttempts(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

const mapApplication = (application: any) => ({
  id: application.id,
  applicantId: application.applicantId,
  applicantName: application.applicantName,
  amount: Number(application.amount),
  purpose: application.purpose,
  termDays: application.termDays,
  channel: application.channel,
  status: application.status,
  total: ["offered","approved","disbursing","active","overdue","paid"].includes(application.status) ? Number(application.total) : null,
  apr: ["offered","approved","disbursing","active","overdue","paid"].includes(application.status) ? Number(application.apr) : null,
  interest: ["offered","approved","disbursing","active","overdue","paid"].includes(application.status) ? Number(application.interest) : null,
  serviceFee: ["offered","approved","disbursing","active","overdue","paid"].includes(application.status) ? Number(application.serviceFee) : null,
  createdAt: application.createdAt,
  decidedAt: application.decidedAt ?? null,
  decisionNotes: application.decisionNotes ?? null,
  offerExpiresAt: application.offerExpiresAt ?? null,
  underwritingStatus: application.underwriting?.status ?? null,
  businessProfile: application.businessProfile ?? null,
  businessReviewStatus: application.businessReviewStatus ?? "not_required",
  businessReviewNotes: application.businessReviewNotes ?? null,
  businessReviewedAt: application.businessReviewedAt ?? null,
});

async function recheckUnderwriting(application: any, user: any, assessment: any) {
  const evidence = await effectiveCreditEvidence(user.id);
  return evaluateUnderwriting({
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
}

async function persistAssessment(applicationId: string, actorId: string | null, result: ReturnType<typeof evaluateUnderwriting>) {
  await prisma.underwritingAssessment.update({
    where: { applicationId },
    data: {
      disposableIncome: BigInt(result.disposableIncome),
      maxAffordablePayment: BigInt(result.maxAffordablePayment),
      creditScore: result.creditScore,
      approvedLimit: BigInt(result.approvedLimit),
      status: result.status,
      flags: result.flags as Prisma.InputJsonValue,
      assessedAt: new Date(),
      assessedBy: actorId,
    },
  });
}

router.get("/applications", authenticateToken, async (req: Request, res: Response) => {
  const staff = isStaffRole(req.user!.role);
  if (staff && !hasPermission(req.user!.role, "loan.review")) throw new AppError("Insufficient permissions", 403);
  const where = staff ? {} : { applicantId: req.user!.userId };
  const applications = await prisma.loanApplication.findMany({
    where,
    include: { underwriting: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ applications: applications.map(mapApplication) });
});

async function createLoanApplicationForUser(
  userId: string,
  payload: {
    amount: number;
    purpose: string;
    termDays: number;
    channel?: string;
    declaredMonthlyIncome: number;
    declaredMonthlyExpenses: number;
    existingDebtPayment: number;
    business: unknown;
  }
) {
  if (!isBusinessLoanPurpose(payload.purpose)) {
    throw new AppError("Choose a valid business loan purpose and describe Other when selected", 400);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  if (!user.phoneVerified) throw new AppError("Verify your phone before applying for a loan", 403);
  if (!user.kycVerified) throw new AppError("Complete identity verification before applying for a loan", 403);

  const open = await prisma.loanApplication.findFirst({
    where: { applicantId: userId, status: { in: OPEN_STATUSES } },
    select: { id: true, status: true },
  });
  if (open) throw new AppError(`You already have an open loan or application (${open.status})`, 409);

  let business: BusinessProfile;
  try { business = parseBusinessProfile(payload.business); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid business information", 422); }
  if (!Number.isInteger(payload.termDays) || payload.termDays < 30 || payload.termDays > 365)
    throw new AppError("Business loan terms must be between 30 and 365 days", 422);
  const breakdown = Object.values(business.useOfFunds).reduce((sum, amount) => sum + amount, 0);
  // Older released clients did not submit itemized funds. Do not turn their
  // requests into unexpected 422 errors; new clients must always balance.
  const hasSpendingPlan = payload.business !== null && typeof payload.business === "object"
    && Object.prototype.hasOwnProperty.call(payload.business, "useOfFunds");
  if (hasSpendingPlan && (!Number.isSafeInteger(breakdown) || breakdown !== payload.amount))
    throw new AppError("The itemized use of funds must equal the requested loan amount", 422);
  // Repayment frequency is only a customer preference. Actual dates, installments
  // and payment obligations must come from the final authorized loan agreement.
  const quote = quoteForRequest(payload.amount, payload.termDays);
  const declaredMonthlyIncome = money(payload.declaredMonthlyIncome, "Monthly business sales");
  const declaredMonthlyExpenses = money(payload.declaredMonthlyExpenses, "Monthly business expenses", true);
  const existingDebtPayment = money(payload.existingDebtPayment, "Existing debt payment", true);
  if (declaredMonthlyIncome !== business.monthlySales ||
      declaredMonthlyExpenses !== business.monthlyBusinessExpenses ||
      existingDebtPayment !== business.monthlyExistingDebt)
    throw new AppError("Loan affordability figures must match the business profile", 422);
  const evidence = await effectiveCreditEvidence(userId);
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
    throw new AppError(`Application does not meet current lending criteria: ${underwriting.flags.join(", ")}`, 422);
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.loanApplication.create({
        data: {
          applicantId: userId,
          applicantName: user.fullName,
          amount: BigInt(quote.principal),
          purpose: payload.purpose,
          businessProfile: business as unknown as Prisma.InputJsonValue,
          businessReviewStatus: "pending",
          termDays: quote.termDays,
          channel: payload.channel || "MTN MoMo",
          apr: quote.apr,
          interest: BigInt(quote.interest),
          total: BigInt(quote.total),
          status: "pending",
        },
      });
      await tx.underwritingAssessment.create({
        data: {
          applicationId: created.id,
          userId,
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
      await assignInitialLoanOfficer(tx, created.id, userId);
      return created;
    });
    await writeAuditEvent({
      actorId: userId,
      subjectUserId: userId,
      action: "loan.application_submitted",
      resourceType: "loan_application",
      resourceId: application.id,
      metadata: { amount: quote.principal, termDays: quote.termDays, purpose: payload.purpose, useOfFunds: business.useOfFunds, expenditureItems: business.expenditureItems ?? [] },
    });
    await notifyLoanCustomer(userId, "Kuula business loan application submitted",
      "Your business loan application was received and is awaiting assessment. Follow the review stages in Kuula.");
    return application;
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") throw new AppError("You already have an open loan or application", 409);
    throw error;
  }
}

router.post("/applications", authenticateToken, async (req: Request, res: Response) => {
  const application = await createLoanApplicationForUser(req.user!.userId, {
    amount: Number(req.body?.amount),
    purpose: typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "",
    termDays: Number(req.body?.termDays),
    channel: typeof req.body?.channel === "string" ? req.body.channel.trim().slice(0, 40) : undefined,
    declaredMonthlyIncome: Number(req.body?.declaredMonthlyIncome),
    declaredMonthlyExpenses: Number(req.body?.declaredMonthlyExpenses),
    existingDebtPayment: Number(req.body?.existingDebtPayment ?? 0),
    business: req.body?.business,
  });
  res.status(201).json({ application: mapApplication(application) });
});

router.post("/applications/:id/business-review", authenticateToken, requirePermissions("loan.review"), async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  const status = String(req.body?.status || "");
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (!["verified", "rejected"].includes(status)) throw new AppError("Status must be verified or rejected", 400);
  if (notes.length < 15 || notes.length > 2000) throw new AppError("Document verification findings (15–2000 characters)", 400);
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application || !application.businessProfile) throw new AppError("Business loan application not found", 404);
  if (!["pending", "resubmitted"].includes(application.status)) throw new AppError("Application is no longer pending review", 409);
  if (status === "verified") await assertBusinessPhotoEvidence(id);
  const updated = await prisma.loanApplication.update({
    where: { id },
    data: {
      businessReviewStatus: status,
      businessReviewNotes: notes,
      businessReviewedAt: new Date(),
      businessReviewedBy: req.user!.userId,
    },
    include: { underwriting: true },
  });
  await writeAuditEvent({
    actorId: req.user!.userId, subjectUserId: application.applicantId,
    action: "loan.business_reviewed", resourceType: "loan_application", resourceId: id,
    metadata: { status, notes },
  });
  res.json({ application: mapApplication(updated) });
});

// A guarantee is a separate legal obligation, not borrower-provided consent.
// Only an independent approver may confirm evidence and an executed undertaking.
router.post("/applications/:id/guarantor-requirement", authenticateToken, requirePermissions("loan.review"), async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID", 400);
  const status = String(req.body?.status || "");
  const reason = String(req.body?.reason || "").trim();
  if (!["required", "waived"].includes(status)) throw new AppError("Status must be required or waived", 400);
  if (reason.length < 20 || reason.length > 2000) throw new AppError("Record a specific risk assessment reason (20–2000 characters)", 400);
  const application = await prisma.loanApplication.findUnique({where: {id},select:{id:true,applicantId:true,status:true,businessProfile:true}});
  if (!application?.businessProfile) throw new AppError("Business application not found",404);
  if (!["pending","resubmitted"].includes(application.status)) throw new AppError("Application cannot be changed after decision",409);
  const current = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id}});
  if (current?.status === "verified") throw new AppError("Verified guarantee cannot be replaced by this route",409);
  const row = await prisma.loanGuarantorRequirement.upsert({
    where:{applicationId:id},
    create:{applicationId:id,status,reason,requestedBy:req.user!.userId,requestedAt:new Date()},
    update:{status,reason,requestedBy:req.user!.userId,requestedAt:new Date(),reviewedBy:null,reviewedAt:null,evidenceReference:null,agreementReference:null},
  });
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:application.applicantId,action:"loan.guarantor_requirement_updated",resourceType:"loan_application",resourceId:id,metadata:{status,reason}});
  res.json({requirement:{status:row.status,reason:row.reason,requestedAt:row.requestedAt}});
});

router.post("/applications/:id/guarantor-verification", authenticateToken, requirePermissions("loan.approve"), async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID",400);
  const evidenceReference = String(req.body?.evidenceReference || "").trim();
  const agreementReference = String(req.body?.agreementReference || "").trim();
  if (evidenceReference.length < 12 || agreementReference.length < 12 || evidenceReference.length > 500 || agreementReference.length > 500)
    throw new AppError("Verification and signed undertaking references are required",400);
  const requirement = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id},include:{application:true}});
  if (!requirement || requirement.status !== "required" || !["pending","resubmitted"].includes(requirement.application.status)) throw new AppError("No pending required guarantee",409);
  if (requirement.requestedBy === req.user!.userId) throw new AppError("Independent approval required",403);
  const row = await prisma.loanGuarantorRequirement.update({where:{id:requirement.id},data:{status:"verified",reviewedBy:req.user!.userId,reviewedAt:new Date(),evidenceReference,agreementReference}});
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:requirement.application.applicantId,action:"loan.guarantor_verified",resourceType:"loan_application",resourceId:id,metadata:{evidenceReference,agreementReference}});
  res.json({requirement:{status:row.status,reviewedAt:row.reviewedAt}});
});

router.post("/top-up", authenticateToken, (_req: Request, res: Response) => {
  res.status(503).json({
    error: "Loan top-ups are disabled until a dedicated refinance and restructuring workflow is approved.",
    code: "TOP_UP_DISABLED",
  });
});

router.post(
  "/applications/decision",
  authenticateToken,
  requirePermissions("loan.approve"),
  async (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    const decision = String(req.body?.decision || "");
    const notes = String(req.body?.notes || "").trim();
    if (!["approved", "rejected"].includes(decision)) throw new AppError("Decision must be approved or rejected", 400);
    if (!notes) throw new AppError("Written decision notes are required", 400);

    const application = await prisma.loanApplication.findUnique({
      where: { id },
      include: { applicant: true, underwriting: true },
    });
    if (!application) throw new AppError("Loan application not found", 404);
    if (!["pending", "resubmitted"].includes(application.status)) throw new AppError("Only pending applications can be decided", 409);
    if (!application.underwriting) throw new AppError("Application has no underwriting assessment", 409);

    if (decision === "approved") {
      const guarantee = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id}});
      if (guarantee?.status === "required") throw new AppError("A required guarantor must independently complete verification and sign the undertaking before approval",409);
      if (guarantee && !["waived","verified","not_required"].includes(guarantee.status)) throw new AppError("Guarantor requirement not resolved",409);
      if (application.businessProfile) await assertBusinessPhotoEvidence(id);
      if (application.businessProfile && application.businessReviewStatus !== "verified")
        throw new AppError("Business verification is required before approval", 422);
      await assertWithinApprovalAuthority(req.user!.role, Number(application.amount));
      const current = await recheckUnderwriting(application, application.applicant, application.underwriting);
      await persistAssessment(application.id, req.user!.userId, current);
      if (!current.approved) throw new AppError(`Application is no longer eligible: ${current.flags.join(", ")}`, 422);
    }

    let officerPricing: {id:string;proposed_by:string;apr:unknown;interest:bigint;other_charges:bigint;total:bigint;fee_breakdown:unknown} | null = null;
    if (decision === "approved") {
      const cases = await prisma.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM credit_cases WHERE application_id=${id}::uuid LIMIT 1`);
      if (cases[0]?.status !== "ready_for_offer") throw new AppError("Independent final credit review must be completed before approval", 409);
      const proposals = await prisma.$queryRaw<Array<{id:string;proposed_by:string;apr:unknown;interest:bigint;other_charges:bigint;total:bigint;fee_breakdown:unknown}>>(Prisma.sql`
        SELECT id,proposed_by,apr,interest,other_charges,total,fee_breakdown FROM loan_pricing_proposals
        WHERE application_id=${id}::uuid AND status='proposed' LIMIT 1`);
      officerPricing = proposals[0] ?? null;
      if (!officerPricing) throw new AppError("Assigned loan officer must prepare an itemized pricing proposal",409);
      if (officerPricing.proposed_by === req.user!.userId) throw new AppError("An independent approver must authorize the officer's terms",403);
      const approval = await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM approval_actions WHERE application_id=${id}::uuid AND level=3 AND action='approve' AND actor_id <> ${officerPricing.proposed_by}::uuid LIMIT 1`);
      if (!approval.length) throw new AppError("Pricing cannot be offered before independent Level 3 approval",409);
      const fresh = await recheckUnderwriting(
        {...application, total: officerPricing.total},
        application.applicant,
        application.underwriting,
      );
      await persistAssessment(application.id, req.user!.userId, fresh);
      if (!fresh.approved) throw new AppError("Proposed terms do not pass the final affordability assessment",422);
    }

    const decidedAt = new Date();
    const offerExpiresAt = decision === "approved"
      ? new Date(decidedAt.getTime() + UNDERWRITING_POLICY.offerValidityHours * 3_600_000)
      : null;
    const updated = await prisma.$transaction(async tx => {
      if (officerPricing) {
        const count = await tx.$executeRaw(Prisma.sql`UPDATE loan_pricing_proposals SET status='approved',approved_by=${req.user!.userId}::uuid,approved_at=NOW() WHERE id=${officerPricing.id}::uuid AND status='proposed'`);
        if (count !== 1) throw new AppError("Pricing proposal changed during approval; retry review",409);
      }
      const count = await tx.loanApplication.updateMany({
        where: {id,status:{in:["pending","resubmitted"]}},
        data: {
          status: decision === "approved" ? "offered" : "rejected",
          decisionNotes: notes,
          decidedAt,
          approvedBy: req.user!.userId,
          offerExpiresAt,
          ...(officerPricing ? {
            apr: Number(officerPricing.apr),
            interest: officerPricing.interest,
            serviceFee: officerPricing.other_charges,
            total: officerPricing.total,
          } : {}),
        },
      });
      if (count.count!==1) throw new AppError("Application decision has already been recorded",409);
      return tx.loanApplication.findUniqueOrThrow({where:{id},include:{underwriting:true}});
    });
    await writeAuditEvent({
      actorId: req.user!.userId,
      subjectUserId: application.applicantId,
      action: decision === "approved" ? "loan.offer_created" : "loan.application_rejected",
      resourceType: "loan_application",
      resourceId: application.id,
      metadata: { notes, offerExpiresAt: offerExpiresAt?.toISOString() ?? null },
    });
    await notifyLoanCustomer(application.applicantId, decision === "approved" ? "Kuula loan offer available" : "Kuula loan application not approved",
      decision === "approved"
        ? "Your application has an approved offer. Sign in to review the exact loan agreement before the offer expires. Funds are not disbursed until independent staff release."
        : "Your business loan application was not approved. Open Kuula to view its status.");
    res.json({ application: mapApplication(updated) });
  }
);

router.get("/:id/offer-charges", authenticateToken, async (req: Request, res: Response) => {
  const id=String(req.params.id);
  const app=await prisma.loanApplication.findUnique({where:{id},select:{applicantId:true,status:true,serviceFee:true}});
  if(!app||app.applicantId!==req.user!.userId)throw new AppError("Loan offer not found",404);
  if(!["offered","approved","disbursing","active","overdue","paid"].includes(app.status))
    throw new AppError("Pricing is only available after your offer is approved",409);
  const rows=await prisma.$queryRaw<Array<{fee_breakdown:unknown}>>(Prisma.sql`
    SELECT fee_breakdown FROM loan_pricing_proposals WHERE application_id=${id}::uuid AND status='approved' LIMIT 1
  `);
  if(!rows.length && Number(app.serviceFee)===0) { res.set("Cache-Control","private, no-store").json({charges:[],feeTotal:0,legacyOffer:true}); return; }
  if(!rows.length)throw new AppError("Verified offer pricing is unavailable",409);
  res.set("Cache-Control","private, no-store").json({charges:rows[0].fee_breakdown,feeTotal:Number(app.serviceFee)});
});

router.post("/:id/agreement/accept", authenticateToken, async (req: Request, res: Response) => {
  const applicationId = String(req.params.id);
  const userId = req.user!.userId;
  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { applicant: true, underwriting: true, agreementAcceptance: true },
  });
  if (!application || application.applicantId !== userId) throw new AppError("Loan offer not found", 404);
  if (application.status !== "offered") throw new AppError("Only an active loan offer can be accepted", 409);
  if (!application.offerExpiresAt || application.offerExpiresAt <= new Date()) throw new AppError("This loan offer has expired", 409);
  if (!application.underwriting) throw new AppError("Loan underwriting record is missing", 409);
  if (application.agreementAcceptance) {
    res.json({
      ok: true,
      acceptedAt: application.agreementAcceptance.acceptedAt,
      agreementVersion: application.agreementAcceptance.agreementVersion,
      agreementHash: application.agreementAcceptance.agreementHash,
    });
    return;
  }

  const current = await recheckUnderwriting(application, application.applicant, application.underwriting);
  await persistAssessment(application.id, null, current);
  if (!current.approved) throw new AppError(`Loan is no longer eligible: ${current.flags.join(", ")}`, 422);

  const termsSnapshot = {
    lender: "Kuula Microfinance Limited",
    applicationId: application.id,
    borrowerId: userId,
    principal: Number(application.amount),
    apr: Number(application.apr),
    interest: Number(application.interest),
    totalRepayment: Number(application.total),
    termDays: application.termDays,
    purpose: application.purpose,
    disbursementChannel: application.channel,
    offerExpiresAt: application.offerExpiresAt.toISOString(),
    interestType: "simple",
    serviceFee: Number(application.serviceFee),
    feeBreakdown: await prisma.$queryRaw<Array<{fee_breakdown:unknown}>>(Prisma.sql`SELECT fee_breakdown FROM loan_pricing_proposals WHERE application_id=${application.id}::uuid AND status='approved' LIMIT 1`).then(rows => rows[0]?.fee_breakdown ?? []),
  };
  const agreementHash = crypto.createHash("sha256").update(JSON.stringify(termsSnapshot)).digest("hex");
  const signature = req.body?.clientContext;
  if (signature?.signatureVersion === "typed_name_v1") {
    const statedName = typeof signature.signedByName === "string" ? signature.signedByName.trim().toLowerCase() : "";
    if (!signature.explicitConsent || !statedName || statedName !== (application.applicant.fullName || "").trim().toLowerCase())
      throw new AppError("Please explicitly sign with your registered full name", 422);
  }
  const clientContext = req.body?.clientContext && typeof req.body.clientContext === "object"
    ? req.body.clientContext as Prisma.InputJsonValue
    : undefined;

  const acceptance = await prisma.loanAgreementAcceptance.create({
    data: {
      applicationId: application.id,
      userId,
      agreementVersion: AGREEMENT_VERSION,
      agreementHash,
      termsSnapshot: termsSnapshot as Prisma.InputJsonValue,
      clientContext,
    },
  });
  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "loan.agreement_accepted",
    resourceType: "loan_application",
    resourceId: application.id,
    metadata: { agreementVersion: AGREEMENT_VERSION, agreementHash },
  });
  await notifyLoanCustomer(userId, "Kuula loan agreement accepted", "Your agreement acceptance has been recorded. Payment will require an independent authorized Kuula disbursement release.");
  res.json({ ok: true, acceptedAt: acceptance.acceptedAt, agreementVersion: AGREEMENT_VERSION, agreementHash });
});

router.post("/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const applicationId = String(req.params.id);
  const userId = req.user!.userId;
  const existing = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { applicant: true, underwriting: true, agreementAcceptance: true },
  });

  if (!existing || existing.applicantId !== userId) throw new AppError("Loan offer not found", 404);
  if (existing.status !== "offered") throw new AppError("Only offered loans can be accepted", 409);
  if (!existing.offerExpiresAt || existing.offerExpiresAt <= new Date()) throw new AppError("This loan offer has expired", 409);
  if (!existing.agreementAcceptance) throw new AppError("Accept the loan agreement before requesting disbursement", 409);
  if (!existing.underwriting) throw new AppError("Loan underwriting record is missing", 409);

  const current = await recheckUnderwriting(existing, existing.applicant, existing.underwriting);
  await persistAssessment(existing.id, null, current);
  if (!current.approved) throw new AppError(`Loan is no longer eligible: ${current.flags.join(", ")}`, 422);

  const phone = providerPhone(existing.applicant.phone);
  const amount = providerAmount(Number(existing.amount));
  const callbackUrl = providerCallbackUrl();
  const reference = createPaymentReference();
  const loanId = existing.loanId || existing.id;

  const claimedApplication = await prisma.$transaction(async (tx) => {
    const claim = await tx.loanApplication.updateMany({
      where: { id: existing.id, applicantId: userId, status: "offered", acceptedAt: null, offerExpiresAt: { gt: new Date() } },
      data: { status: "disbursing", acceptedAt: new Date(), loanId },
    });
    if (claim.count !== 1) throw new AppError("This loan offer is already being processed or has expired", 409);

    await tx.transaction.create({
      data: {
        userId,
        loanId,
        type: "loan_disbursement",
        amount: BigInt(amount),
        status: "pending",
        reference,
        provider: "marzpay",
        providerStatus: "initiating",
        reconciliationStatus: "unreconciled",
      },
    });
    return tx.loanApplication.findUniqueOrThrow({ where: { id: existing.id } });
  });

  const result = await sendMoney({ phone, amount, reference, description: `Kuula loan ${loanId}`, callbackUrl });

  if (!result.accepted) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { reference },
        data: {
          status: "failed",
          providerStatus: result.status,
          transactionId: result.uuid || null,
          providerPayload: result.raw as Prisma.InputJsonValue,
          reconciliationStatus: "reconciliation_required",
        },
      }),
      prisma.loanApplication.update({
        where: { id: existing.id },
        data: { status: "offered", acceptedAt: null, disbursementRef: result.uuid || reference },
      }),
    ]);
    throw new AppError(`Mobile-money disbursement was not accepted: ${result.message}`, 502);
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { reference },
      data: {
        providerStatus: result.status || "processing",
        transactionId: result.uuid || null,
        providerPayload: result.raw as Prisma.InputJsonValue,
      },
    }),
    prisma.loanApplication.update({ where: { id: existing.id }, data: { disbursementRef: result.uuid || reference } }),
  ]);
  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "loan.disbursement_requested",
    resourceType: "transaction",
    resourceId: reference,
    metadata: { applicationId: existing.id, amount },
  });

  res.json({
    application: mapApplication(claimedApplication),
    disbursement: { status: "pending", uuid: result.uuid, reference, message: "Your mobile-money disbursement is being processed." },
  });
});

router.post("/quote", authenticateToken, requirePermissions("loan.review"), async (req: Request, res: Response) => {
  res.json(quoteForRequest(req.body?.amount, req.body?.termDays));
});

router.get("/repayment", authenticateToken, async (req: Request, res: Response) => {
  const repayment = await prisma.repayment.findFirst({
    where: { userId: req.user!.userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });
  if (!repayment) {
    res.json({ repayment: null });
    return;
  }

  const daysToDue = Math.ceil((repayment.dueDate.getTime() - Date.now()) / 86_400_000);
  res.json({
    repayment: {
      ...repayment,
      total: Number(repayment.total),
      amountPaid: Number(repayment.amountPaid),
      amount_paid: Number(repayment.amountPaid),
      due_date: repayment.dueDate,
      collection: {
        stage: repayment.pendingCollectionRef ? "processing" : "scheduled",
        label: repayment.pendingCollectionRef ? "Mobile-money payment pending" : daysToDue < 0 ? `${Math.abs(daysToDue)} days overdue` : `Due in ${daysToDue} days`,
        daysToDue,
      },
    },
  });
});

router.post("/repayment/pay", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const repayment = await prisma.repayment.findFirst({
    where: { userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });
  if (!repayment) {
    res.json({ repayment: null, attempt: { success: false, reason: "no-active-loan" }, isPending: false, isPartial: false });
    return;
  }
  if (repayment.pendingCollectionRef) throw new AppError("A mobile-money repayment is already pending", 409);

  const outstanding = Number(repayment.total) - Number(repayment.amountPaid);
  const requested = req.body?.amount === undefined ? outstanding : Math.round(Number(req.body.amount));
  if (!Number.isFinite(requested) || requested <= 0 || requested > outstanding) {
    throw new AppError("Payment amount must be positive and cannot exceed the outstanding balance", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  if (!user.phoneVerified) throw new AppError("Verify your phone before making a repayment", 403);

  const phone = providerPhone(user.phone);
  const amount = providerAmount(requested);
  const callbackUrl = providerCallbackUrl();
  const reference = createPaymentReference();
  const attempts = jsonAttempts(repayment.attempts);

  await prisma.$transaction(async (tx) => {
    const claim = await tx.repayment.updateMany({
      where: { id: repayment.id, status: { not: "paid" }, pendingCollectionRef: null },
      data: {
        pendingCollectionRef: reference,
        attempts: [...attempts, { at: new Date().toISOString(), method: "mobile-money-collection", amount, success: false, reason: "request-created", reference }] as Prisma.InputJsonValue,
      },
    });
    if (claim.count !== 1) throw new AppError("A mobile-money repayment is already pending", 409);
    await tx.transaction.create({
      data: {
        userId,
        loanId: repayment.loanId,
        type: "loan_payment",
        amount: BigInt(amount),
        status: "pending",
        reference,
        provider: "marzpay",
        providerStatus: "initiating",
        reconciliationStatus: "unreconciled",
      },
    });
  });

  const result = await collectMoney({ phone, amount, reference, description: `Kuula repayment ${repayment.loanId}`, callbackUrl });
  if (result.outcome === "unknown") {
    // MarzPay may have sent the prompt. Keep the collection open so the callback or a
    // status lookup can still credit the loan if the customer approves it.
    await prisma.transaction.update({
      where: { reference },
      data: { providerStatus: "unknown", providerPayload: result.raw as Prisma.InputJsonValue, reconciliationStatus: "awaiting_provider" },
    });
    res.status(202).json({
      repayment: { ...repayment, total: Number(repayment.total), amountPaid: Number(repayment.amountPaid), amount_paid: Number(repayment.amountPaid) },
      attempt: { success: false, reason: "confirming-with-provider" },
      isPending: true,
      isPartial: amount < outstanding,
      reference,
      uuid: null,
      message: "We are confirming this payment with Mobile Money. Do not pay again; your balance updates as soon as it is confirmed.",
    });
    return;
  }
  if (!result.accepted) {
    const currentRepayment = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    await prisma.$transaction([
      prisma.transaction.update({
        where: { reference },
        data: {
          status: "failed",
          providerStatus: result.status,
          transactionId: result.uuid || null,
          providerPayload: result.raw as Prisma.InputJsonValue,
          reconciliationStatus: "reconciliation_required",
        },
      }),
      prisma.repayment.update({
        where: { id: repayment.id },
        data: {
          pendingCollectionRef: null,
          attempts: [...jsonAttempts(currentRepayment.attempts), { at: new Date().toISOString(), method: "mobile-money-collection", amount, success: false, reason: "provider-request-rejected", reference, detail: result.message }] as Prisma.InputJsonValue,
        },
      }),
    ]);
    throw new AppError(`Mobile-money collection was not accepted: ${result.message}`, 502);
  }

  await prisma.transaction.update({
    where: { reference },
    data: { providerStatus: result.status || "processing", transactionId: result.uuid || null, providerPayload: result.raw as Prisma.InputJsonValue },
  });
  await writeAuditEvent({
    actorId: userId,
    subjectUserId: userId,
    action: "loan.repayment_requested",
    resourceType: "transaction",
    resourceId: reference,
    metadata: { loanId: repayment.loanId, amount },
  });

  res.json({
    repayment: { ...repayment, total: Number(repayment.total), amountPaid: Number(repayment.amountPaid), amount_paid: Number(repayment.amountPaid) },
    attempt: { success: false, reason: "pending-customer-approval" },
    isPending: true,
    isPartial: amount < outstanding,
    amount,
    reference,
    uuid: result.uuid,
    message: "Approve the mobile-money prompt on your phone to complete the repayment.",
  });
});

export default router;
