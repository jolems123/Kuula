import { assignInitialLoanOfficer } from "../lib/auto-assign-officer.js";
import { notifyLoanCustomer } from "../lib/loan-customer-notifications.js";
import crypto from "node:crypto";
import { sendGuarantorSms } from "../lib/sms.js";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, hasPermission, isStaffRole, requirePermissions } from "../middleware/auth.js";
import { assertLoanIdentityApproved } from "../lib/loan-identity.js";
import { AppError } from "../middleware/error-handler.js";
import { guarantorCleared } from "../lib/guarantor-policy.js";
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
    throw new AppError("Choose one or more valid business loan purposes and describe Other when selected", 400);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  await assertLoanIdentityApproved(user, () => prisma.kycSubmission.findFirst({ where: { userId }, orderBy: { version: "desc" }, select: { status: true } }));

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
  if (status !== "required") throw new AppError("Only a requirement can be issued here; waivers require independent credit approval", 400);
  if (reason.length < 20 || reason.length > 2000) throw new AppError("Record a specific risk assessment reason (20–2000 characters)", 400);
  const application = await prisma.loanApplication.findUnique({where: {id},select:{id:true,applicantId:true,status:true,businessProfile:true}});
  if (!application?.businessProfile) throw new AppError("Business application not found",404);
  if (!["pending","resubmitted"].includes(application.status)) throw new AppError("Application cannot be changed after decision",409);
  const current = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id}});
  if (current && ["verified","signed_pending_review"].includes(current.status)) throw new AppError("Signed or verified guarantee cannot be replaced by this route",409);
  const row = await prisma.loanGuarantorRequirement.upsert({
    where:{applicationId:id},
    create:{applicationId:id,status,reason,requestedBy:req.user!.userId,requestedAt:new Date()},
    update:{status,reason,requestedBy:req.user!.userId,requestedAt:new Date(),reviewedBy:null,reviewedAt:null,evidenceReference:null,agreementReference:null},
  });
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:application.applicantId,action:"loan.guarantor_requirement_updated",resourceType:"loan_application",resourceId:id,metadata:{status,reason}});
  res.json({requirement:{status:row.status,reason:row.reason,requestedAt:row.requestedAt}});
});

// Access is scoped to the borrower or authorised credit staff; do not expose third-party identity evidence.
router.get("/applications/:id/guarantor-requirement", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID",400);
  const application = await prisma.loanApplication.findUnique({where:{id},select:{applicantId:true}});
  if (!application || (application.applicantId !== req.user!.userId && !hasPermission(req.user!.role,"loan.review"))) throw new AppError("Application not found",404);
  const requirement = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id}});
  const staff = hasPermission(req.user!.role,"loan.review");
  res.json({requirement:requirement?{status:requirement.status,requestedAt:requirement.requestedAt,reviewedAt:requirement.reviewedAt,...(staff?{reason:requirement.reason}:{})}: {status:"not_required"}});
});

// A waiver cannot be granted by the officer who requested the guarantor.
router.post("/applications/:id/guarantor-waiver", authenticateToken, requirePermissions("loan.approve"), async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID",400);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 30 || reason.length > 2000) throw new AppError("Independent documented waiver rationale (30–2000 characters) required",400);
  const original = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id},include:{application:true}});
  if (!original || original.status !== "required" || !["pending","resubmitted"].includes(original.application.status)) throw new AppError("No open guarantor requirement",409);
  if (original.requestedBy === req.user!.userId) throw new AppError("Independent credit approver required",403);
  const result = await prisma.loanGuarantorRequirement.updateMany({where:{id:original.id,status:"required"},data:{status:"waived",reason,reviewedBy:req.user!.userId,reviewedAt:new Date(),evidenceReference:null,agreementReference:null}});
  if (result.count !== 1) throw new AppError("Requirement was modified concurrently",409);
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:original.application.applicantId,action:"loan.guarantor_waived",resourceType:"loan_application",resourceId:id,metadata:{reason}});
  res.json({requirement:{status:"waived",reason}});
});

// A nominated person only consents to being contacted, not to any debt.
router.post("/applications/:id/guarantor-invitation", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID",400);
  const applicant = await prisma.loanApplication.findUnique({where:{id},select:{applicantId:true,status:true}});
  if (!applicant || applicant.applicantId !== req.user!.userId) throw new AppError("Application not found",404);
  if (!["pending","resubmitted"].includes(applicant.status)) throw new AppError("Application cannot be modified",409);
  const requirement = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id}});
  if (!requirement || requirement.status !== "required") throw new AppError("A credit officer must request a guarantor first",409);
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const relationship = typeof req.body?.relationship === "string" ? req.body.relationship.trim() : "";
  if (fullName.length < 3 || fullName.length > 120 || relationship.length < 3 || relationship.length > 80 || req.body?.permissionToContact !== true)
    throw new AppError("Name, relationship and explicit permission to contact are required",400);
  let phone: string;
  try { phone = normalizeUgandaMobileMoneyPhone(String(req.body?.phone || "")); }
  catch { throw new AppError("Invalid Uganda phone number",400); }
  const existing = await prisma.loanGuarantorInvitation.findUnique({where:{requirementId:requirement.id}});
  if (existing && existing.expiresAt > new Date() && !existing.declinedAt) throw new AppError("An invitation is already pending",409);
  const token = crypto.randomBytes(32).toString("hex");
  const invitationTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const invitation = await prisma.loanGuarantorInvitation.upsert({
    where:{requirementId:requirement.id},
    create:{requirementId:requirement.id,fullName,phone,relationship,invitationTokenHash,expiresAt},
    update:{fullName,phone,relationship,invitationTokenHash,expiresAt,acceptedAt:null,declinedAt:null},
  });
  // Do not return an invitation token to the borrower.
  const baseUrl = process.env.GUARANTOR_INVITE_BASE_URL;
  const link = baseUrl ? new URL(baseUrl) : null;
  if (link) { link.search = ""; link.hash = `/guarantor/invitation?token=${token}`; }
  const sent = link ? await sendGuarantorSms(phone,`Kuula: you were nominated as a possible guarantor. This is NOT a loan guarantee. Review securely: ${link.toString()}`) : false;
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:req.user!.userId,action:"loan.guarantor_invited",resourceType:"loan_application",resourceId:id,metadata:{invitationId:invitation.id,smsAccepted:sent}});
  res.status(202).json({invitation:{id:invitation.id,status:"pending",expiresAt},deliveryAccepted:sent,message:sent?"Invitation sent for review":"Invitation recorded; SMS delivery is not confirmed"});
});

// Unauthenticated invited person can decline; a positive response never marks a guarantee verified.
router.post("/guarantor-invitations/respond", async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("Invalid or expired invitation",404);
  const invitationTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.loanGuarantorInvitation.findUnique({where:{invitationTokenHash}});
  if (!invitation || invitation.expiresAt <= new Date() || invitation.acceptedAt || invitation.declinedAt) throw new AppError("Invalid or expired invitation",404);
  const response = req.body?.response;
  if (!["interested","decline"].includes(response)) throw new AppError("Choose interested or decline",400);
  const changed = await prisma.loanGuarantorInvitation.updateMany({
    where:{id:invitation.id,acceptedAt:null,declinedAt:null,expiresAt:{gt:new Date()}},
    data:response === "decline"?{declinedAt:new Date()}:{acceptedAt:new Date()},
  });
  if(changed.count!==1) throw new AppError("Invitation already handled",409);
  await writeAuditEvent({action:response==="decline"?"loan.guarantor_declined":"loan.guarantor_expressed_interest",resourceType:"loan_guarantor_invitation",resourceId:invitation.id});
  res.json({ok:true,message:response==="decline"?"Invitation declined":"Interest recorded. No guarantee or debt obligation has been created."});
});

// Guarantor signs only after the final loan offer exists and using a separate
// authenticated, phone-verified and KYC-reviewed Kuula account.
// This creates an evidentiary record; release of the feature remains subject to legal review.
router.post("/guarantor-invitations/terms", authenticateToken, async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("Invalid invitation",404);
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const invite = await prisma.loanGuarantorInvitation.findUnique({where:{invitationTokenHash:hash},include:{requirement:{include:{application:true}}}});
  if (!invite || invite.expiresAt <= new Date() || invite.declinedAt || !invite.acceptedAt) throw new AppError("Invitation is unavailable",404);
  const user = await prisma.user.findUnique({where:{id:req.user!.userId},select:{id:true,phone:true,phoneVerified:true,kycVerified:true,fullName:true}});
  if(!user || !user.phoneVerified || !user.kycVerified || normalizeUgandaMobileMoneyPhone(user.phone || "") !== invite.phone)
    throw new AppError("Sign in with a verified Kuula account using the invited phone number and approved identity",403);
  const app = invite.requirement.application;
  if (app.status !== "offered" || !app.offerExpiresAt || app.offerExpiresAt <= new Date()) throw new AppError("Final loan terms are not currently available",409);
  if(app.applicantId===user.id) throw new AppError("Borrowers cannot guarantee their own loan",403);
  res.json({terms:{applicationId:app.id,borrower:app.applicantName,principal:Number(app.amount),totalLiability:Number(app.total),termDays:app.termDays,offerExpiresAt:app.offerExpiresAt,identityName:user.fullName,requirementStatus:invite.requirement.status,disclosure:"A guarantee may require you to pay amounts the borrower fails to pay, up to the stated maximum liability. Seek independent legal advice before signing. Signing is voluntary."}});
});

// Fresh SMS proof binds the specific guarantee signature to the invited phone.
router.post("/guarantor-invitations/sign-otp/request", authenticateToken, async (req: Request, res: Response) => {
  const token=typeof req.body?.token==="string"?req.body.token:"";
  if(!/^[a-f0-9]{64}$/.test(token)) throw new AppError("Invalid invitation",404);
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const invite=await prisma.loanGuarantorInvitation.findUnique({where:{invitationTokenHash:hash},include:{requirement:{include:{application:true}}}});
  if(!invite || invite.expiresAt<=new Date() || !invite.acceptedAt || invite.declinedAt || invite.signedAt || invite.requirement.status!=="required" || invite.requirement.application.status!=="offered") throw new AppError("Invitation is not ready for signing",409);
  const user=await prisma.user.findUnique({where:{id:req.user!.userId},select:{id:true,phone:true,phoneVerified:true,kycVerified:true}});
  if(!user?.phoneVerified || !user.kycVerified || normalizeUgandaMobileMoneyPhone(user.phone||"")!==invite.phone || user.id===invite.requirement.application.applicantId) throw new AppError("A separate verified guarantor account is required",403);
  if (invite.otpSentAt && Date.now()-invite.otpSentAt.getTime()<60000) throw new AppError("Wait before requesting another code",429);
  if(invite.otpSendCount>=10) throw new AppError("Too many signature codes requested",429);
  const pepper=process.env.OTP_PEPPER;
  if(!pepper || pepper.length<32) throw new AppError("Secure OTP signing is not configured",503);
  const code=String(crypto.randomInt(100000,1000000));
  const otpHash=crypto.createHmac("sha256",pepper).update(invite.id+":"+user.id+":"+code).digest("hex");
  const changed=await prisma.loanGuarantorInvitation.updateMany({where:{id:invite.id,signedAt:null,otpSendCount:{lt:10}},data:{otpHash,otpExpiresAt:new Date(Date.now()+10*60000),otpSentAt:new Date(),otpVerifiedAt:null,otpAttempts:0,otpSendCount:{increment:1}}});
  if(changed.count!==1) throw new AppError("Invitation changed, retry safely",409);
  const sent=await sendGuarantorSms(invite.phone,"Kuula guarantee signature verification code: "+code+". Expires in 10 minutes. Never share this code.");
  if(!sent) {
    await prisma.loanGuarantorInvitation.updateMany({where:{id:invite.id,otpHash},data:{otpExpiresAt:new Date(0),otpHash:null}});
    throw new AppError("SMS delivery was not confirmed. Signing is unavailable.",503);
  }
  res.json({ok:true,message:"Signature verification code sent to invited phone."});
});

router.post("/guarantor-invitations/sign-otp/verify", authenticateToken, async (req: Request, res: Response) => {
  const token=typeof req.body?.token==="string"?req.body.token:"";
  const code=typeof req.body?.code==="string"?req.body.code:"";
  if(!/^[a-f0-9]{64}$/.test(token) || !/^[0-9]{6}$/.test(code)) throw new AppError("Invalid verification request",400);
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const invite=await prisma.loanGuarantorInvitation.findUnique({where:{invitationTokenHash:hash}});
  if(!invite || invite.expiresAt<=new Date() || invite.signedAt || invite.declinedAt || !invite.otpHash || !invite.otpExpiresAt || invite.otpExpiresAt<=new Date() || invite.otpAttempts>=5) throw new AppError("Code expired or attempts exhausted",409);
  const user=await prisma.user.findUnique({where:{id:req.user!.userId},select:{id:true,phone:true,phoneVerified:true,kycVerified:true}});
  if(!user?.phoneVerified || !user.kycVerified || normalizeUgandaMobileMoneyPhone(user.phone||"")!==invite.phone) throw new AppError("Verified invited user required",403);
  const pepper=process.env.OTP_PEPPER;
  if(!pepper || pepper.length<32) throw new AppError("Secure OTP signing is unavailable",503);
  const expected=crypto.createHmac("sha256",pepper).update(invite.id+":"+user.id+":"+code).digest("hex");
  const valid=crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(invite.otpHash,"hex"));
  const row=await prisma.loanGuarantorInvitation.updateMany({where:{id:invite.id,otpHash:invite.otpHash,otpAttempts:{lt:5},otpExpiresAt:{gt:new Date()}},data:valid?{otpVerifiedAt:new Date(),otpHash:null}:{otpAttempts:{increment:1}}});
  if(row.count!==1 || !valid) throw new AppError("Invalid verification code",400);
  res.json({ok:true,message:"Phone ownership confirmed for this signature."});
});

router.post("/guarantor-invitations/sign", authenticateToken, async (req: Request, res: Response) => {
  if (process.env.GUARANTOR_LEGAL_TERMS_APPROVED !== "true") throw new AppError("Guarantor legal terms have not yet been authorized for live signing",503);
  const token = typeof req.body?.token==="string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("Invalid invitation",404);
  if(req.body?.acceptedLiability!==true || req.body?.independentAdviceAcknowledged!==true)
    throw new AppError("Explicit acknowledgement of liability and legal advice is required",400);
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const invite = await prisma.loanGuarantorInvitation.findUnique({where:{invitationTokenHash:hash},include:{requirement:{include:{application:true}}}});
  if(!invite || invite.expiresAt<=new Date() || invite.declinedAt || !invite.acceptedAt || invite.signedAt) throw new AppError("Invitation expired or already handled",409);
  if(!invite.otpVerifiedAt || Date.now()-invite.otpVerifiedAt.getTime()>10*60000) throw new AppError("Complete fresh SMS verification before signing",403);
  const user = await prisma.user.findUnique({where:{id:req.user!.userId},select:{id:true,phone:true,phoneVerified:true,kycVerified:true,fullName:true}});
  if(!user || !user.kycVerified || !user.phoneVerified || normalizeUgandaMobileMoneyPhone(user.phone || "")!==invite.phone)
    throw new AppError("Independent verified identity and matching phone number required",403);
  const app = invite.requirement.application;
  if(app.status!=="offered" || !app.offerExpiresAt || app.offerExpiresAt<=new Date() || app.applicantId===user.id || invite.requirement.status!=="required")
    throw new AppError("No current guarantee awaiting signature",409);
  if(!Number.isFinite(Number(app.total)) || Number(app.total)<=0) throw new AppError("Valid final liability amount required",409);
  const signedName = typeof req.body?.signedName==="string" ? req.body.signedName.trim():"";
  if(signedName.toLocaleLowerCase() !== user.fullName.trim().toLocaleLowerCase()) throw new AppError("Signature name must match your verified profile",400);
  const snapshot = {agreementVersion:"guarantor-2026-10-v1",applicationId:app.id,borrower:app.applicantName,guarantorUserId:user.id,guarantorName:user.fullName,principal:Number(app.amount),maximumLiability:Number(app.total),termDays:app.termDays,offerExpiresAt:app.offerExpiresAt,liabilityAcknowledged:true,adviceAcknowledged:true};
  const signatureHash = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  await prisma.$transaction(async tx=>{
    const updated = await tx.loanGuarantorInvitation.updateMany({where:{id:invite.id,signedAt:null,declinedAt:null,expiresAt:{gt:new Date()}},data:{guarantorUserId:user.id,signatureHash,signedAt:new Date(),agreementSnapshot:snapshot}});
    if(updated.count!==1) throw new AppError("Guarantee already signed",409);
    const changed = await tx.loanGuarantorRequirement.updateMany({where:{id:invite.requirement.id,status:"required"},data:{status:"signed_pending_review",reviewedAt:null,reviewedBy:null,evidenceReference:`kyc:user:${user.id}`,agreementReference:signatureHash}});
    if(changed.count!==1) throw new AppError("Requirement changed during signing",409);
  });
  await writeAuditEvent({actorId:user.id,subjectUserId:app.applicantId,action:"loan.guarantor_undertaking_recorded",resourceType:"loan_application",resourceId:app.id,metadata:{guarantorUserId:user.id,signatureHash,maximumLiability:Number(app.total),agreementVersion:snapshot.agreementVersion}});
  res.json({ok:true,signatureHash,message:"Your guarantor acceptance has been recorded."});
});

// The credit approver verifies internal identity and signed evidence; no self-reported
// external reference can mark a guarantor as verified.
router.post("/applications/:id/guarantor-verification", authenticateToken, requirePermissions("loan.approve"), async (req: Request, res: Response) => {
  if (process.env.GUARANTOR_LEGAL_TERMS_APPROVED !== "true") throw new AppError("Guarantor legal terms require compliance approval",503);
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new AppError("Invalid application ID",400);
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if(notes.length<30 || notes.length>2000) throw new AppError("Document verification findings (30–2000 characters) required",400);
  const row = await prisma.loanGuarantorRequirement.findUnique({where:{applicationId:id},include:{application:true,invitation:true}});
  if (!row || row.status!=="signed_pending_review" || !row.invitation?.signedAt || !row.invitation.guarantorUserId || !row.invitation.signatureHash || !row.invitation.agreementSnapshot) throw new AppError("A independently signed guarantor undertaking is required",409);
  const recordedHash=crypto.createHash("sha256").update(JSON.stringify(row.invitation.agreementSnapshot)).digest("hex");
  if (recordedHash !== row.invitation.signatureHash || recordedHash !== row.agreementReference) throw new AppError("Stored guarantee evidence failed integrity verification",409);
  if (row.requestedBy===req.user!.userId || row.invitation.guarantorUserId===req.user!.userId || row.application.applicantId===req.user!.userId) throw new AppError("Independent approver required",403);
  if(row.application.status!=="offered" || !row.application.offerExpiresAt || row.application.offerExpiresAt<=new Date()) throw new AppError("Loan offer expired or unavailable",409);
  const guarantor=await prisma.user.findUnique({where:{id:row.invitation.guarantorUserId},select:{phoneVerified:true,kycVerified:true,phone:true,deletedAt:true}});
  if (!guarantor?.phoneVerified || !guarantor.kycVerified || guarantor.deletedAt || normalizeUgandaMobileMoneyPhone(guarantor.phone||"")!==row.invitation.phone) throw new AppError("Guarantor identity requires independent KYC validation",409);
  const changed=await prisma.loanGuarantorRequirement.updateMany({where:{id:row.id,status:"signed_pending_review",agreementReference:row.invitation.signatureHash},data:{status:"verified",reviewedBy:req.user!.userId,reviewedAt:new Date()}});
  if(changed.count!==1) throw new AppError("Guarantee changed during approval",409);
  await writeAuditEvent({actorId:req.user!.userId,subjectUserId:row.application.applicantId,action:"loan.guarantor_independently_approved",resourceType:"loan_application",resourceId:id,metadata:{notes,signatureHash:row.invitation.signatureHash,guarantorUserId:row.invitation.guarantorUserId}});
  res.json({requirement:{status:"verified",reviewNotes:notes}});
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
      // Final terms must first be offered before a guarantor can knowingly accept maximum liability.
      // Disbursement remains independently blocked until the guarantee is verified.
      if (guarantee && !["waived","verified","not_required","required"].includes(guarantee.status)) throw new AppError("Guarantor requirement not resolved",409);
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

  const guaranteeHold = await prisma.loanGuarantorRequirement.findUnique({ where: { applicationId: existing.id } });
  if (!guarantorCleared(guaranteeHold?.status)) {
    throw new AppError("Disbursement blocked: guarantor requirement is unresolved", 409);
  }
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
