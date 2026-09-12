import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
router.use(authenticateToken, requirePermissions("customer.view"));

function roleLevel(role: string): number {
  if (["officer", "loan_officer"].includes(role)) return 1;
  if (["manager", "credit_manager"].includes(role)) return 2;
  if (["admin", "administrator", "super_admin", "final_approver"].includes(role)) return 3;
  return 0;
}

function maskNin(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

/**
 * Enrich the canonical credit-case response without taking ownership of the
 * underlying workflow route. This middleware runs before credit-operations.ts,
 * lets that route build the authoritative case, then adds borrower declarations,
 * affordability evidence, risk flags and a derived evidence checklist.
 */
router.get("/applications/:id", async (req: Request, res: Response, next: NextFunction) => {
  const applicationId = String(req.params.id || "").trim();
  if (!validUuid(applicationId)) throw new AppError("Application ID is invalid", 400);

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.statusCode >= 400 || body?.application?.id !== applicationId) return originalJson(body);
    void Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT employment_status, occupation_or_business, employer_or_business_name,
               work_duration, income_source, repayment_source
        FROM loan_application_details
        WHERE application_id = ${applicationId}::uuid
        LIMIT 1
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT declared_monthly_income, declared_monthly_expenses, existing_debt_payment,
               verified_monthly_income, disposable_income, max_affordable_payment,
               credit_score, approved_limit, status, flags
        FROM underwriting_assessments
        WHERE application_id = ${applicationId}::uuid
        LIMIT 1
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT source_type, status, expires_at, revoked_at
        FROM credit_evidence
        WHERE user_id = ${body.application.applicantId}::uuid
        ORDER BY observed_at DESC
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT evidence_type, count(*)::int AS count
        FROM evaluation_evidence
        WHERE application_id = ${applicationId}::uuid
        GROUP BY evidence_type
      `),
      prisma.user.findUnique({
        where: { id: body.application.applicantId },
        select: { phoneVerified: true },
      }),
    ]).then(([detailsRows, assessmentRows, creditRows, evidenceRows, applicant]) => {
      const details = detailsRows[0] || null;
      const assessment = assessmentRows[0] || null;
      const now = new Date();
      const liveCredit = (source: string) => creditRows.some((row) =>
        row.source_type === source && row.status === "verified" && !row.revoked_at && new Date(row.expires_at) > now
      );
      const evidenceCount = evidenceRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
      const evidenceTypes = new Set(evidenceRows.map((row) => String(row.evidence_type)));
      const employmentStatus = details?.employment_status || null;
      const businessApplicant = ["Business owner", "Self-employed", "Farmer"].includes(employmentStatus);
      const kycVerified = Boolean(body.application.customer?.kycVerified);
      const phoneVerified = Boolean(applicant?.phoneVerified);
      const flags = Array.isArray(assessment?.flags) ? assessment.flags.map(String) : [];

      const checklist = [
        { key: "identity", label: "National ID / KYC", required: true, status: kycVerified ? "verified" : "missing", detail: kycVerified ? "Identity verification complete" : "Identity verification is incomplete" },
        { key: "phone", label: "Verified phone number", required: true, status: phoneVerified ? "verified" : "missing", detail: phoneVerified ? "Account phone verified" : "Phone verification is incomplete" },
        { key: "crb", label: "CRB / credit evidence", required: true, status: liveCredit("crb") ? "verified" : "missing", detail: liveCredit("crb") ? "Current verified CRB evidence" : "No current verified CRB evidence" },
        { key: "momo", label: "Mobile-money evidence", required: true, status: liveCredit("momo") ? "verified" : "missing", detail: liveCredit("momo") ? "Current verified mobile-money evidence" : "No current verified mobile-money evidence" },
        { key: "livelihood", label: "Employment / livelihood declaration", required: true, status: details ? "received" : "missing", detail: details ? `${details.employment_status} · ${details.income_source}` : "Borrower livelihood declaration is missing" },
        { key: "field_evidence", label: "Field supporting evidence", required: true, status: evidenceCount >= 2 ? "received" : "missing", detail: `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} uploaded` },
        ...(businessApplicant ? [
          { key: "business_site", label: "Business/site evidence", required: true, status: (evidenceTypes.has("storefront") || evidenceTypes.has("business_interior") || evidenceTypes.has("applicant_at_business")) ? "received" : "missing", detail: "Required for business/self-employed/farming cases" },
          { key: "business_docs", label: "Business document evidence", required: false, status: (evidenceTypes.has("licence") || evidenceTypes.has("supplier_invoice")) ? "received" : "not_provided", detail: "Licence or supplier invoice where available" },
        ] : []),
      ];

      const requestedAmount = Number(body.application.amount || 0);
      const approvedLimit = assessment?.approved_limit == null ? null : Number(assessment.approved_limit);
      const maxAffordablePayment = assessment?.max_affordable_payment == null ? null : Number(assessment.max_affordable_payment);
      const riskSummary = {
        status: flags.length === 0 && checklist.every((item) => !item.required || item.status === "verified" || item.status === "received") ? "clear" : "review_required",
        flags,
        requestedAboveLimit: approvedLimit != null && requestedAmount > approvedLimit,
        missingRequiredEvidence: checklist.filter((item) => item.required && item.status === "missing").map((item) => item.label),
      };

      originalJson({
        ...body,
        application: {
          ...body.application,
          customer: { ...body.application.customer, phoneVerified },
          livelihood: details ? {
            employmentStatus: details.employment_status,
            occupationOrBusiness: details.occupation_or_business,
            employerOrBusinessName: details.employer_or_business_name,
            workDuration: details.work_duration,
            incomeSource: details.income_source,
            repaymentSource: details.repayment_source,
          } : null,
          affordability: assessment ? {
            declaredMonthlyIncome: Number(assessment.declared_monthly_income),
            declaredMonthlyExpenses: Number(assessment.declared_monthly_expenses),
            existingDebtPayment: Number(assessment.existing_debt_payment),
            verifiedMonthlyIncome: assessment.verified_monthly_income == null ? null : Number(assessment.verified_monthly_income),
            disposableIncome: Number(assessment.disposable_income),
            maxAffordablePayment,
            creditScore: assessment.credit_score,
            approvedLimit,
            underwritingStatus: assessment.status,
          } : null,
        },
        documentChecklist: checklist,
        riskSummary,
      });
    }).catch(next);
    return res;
  }) as Response["json"];
  next();
});

router.get("/dashboard", async (req: Request, res: Response) => {
  const level = roleLevel(req.user!.role);
  if (!level) throw new AppError("Staff role required", 403);
  const userId = req.user!.userId;
  const queue = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.application_id AS id, c.current_level, c.status, c.updated_at,
           a.applicant_name, a.amount, a.purpose, a.created_at,
           u.phone, u.kyc_verified,
           ua.credit_score, ua.approved_limit
    FROM credit_cases c
    JOIN loan_applications a ON a.id = c.application_id
    JOIN users u ON u.id = c.customer_id
    LEFT JOIN underwriting_assessments ua ON ua.application_id = a.id
    LEFT JOIN approval_assignments aa ON aa.application_id = c.application_id
      AND aa.level = c.current_level
      AND aa.status = 'active'
    WHERE c.current_level = ${level}
      AND c.status NOT IN ('completed','rejected')
      AND (${["admin", "administrator", "super_admin"].includes(req.user!.role)}::boolean OR aa.assignee_id = ${userId}::uuid)
    ORDER BY c.updated_at ASC
    LIMIT 200
  `);
  const counts = queue.reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  res.json({
    level,
    role: req.user!.role,
    counts,
    queue: queue.map((row) => ({
      ...row,
      amount: Number(row.amount),
      approved_limit: row.approved_limit == null ? null : Number(row.approved_limit),
    })),
  });
});

router.post("/applications/:id/decision", async (req: Request, _res: Response, next: NextFunction) => {
  const applicationId = String(req.params.id || "").trim();
  if (!validUuid(applicationId)) throw new AppError("Application ID is invalid", 400);

  const cases = await prisma.$queryRaw<Array<{ current_level: number; assignee_id: string | null }>>(Prisma.sql`
    SELECT c.current_level, aa.assignee_id
    FROM credit_cases c
    LEFT JOIN approval_assignments aa ON aa.application_id = c.application_id
      AND aa.level = c.current_level
      AND aa.status = 'active'
    WHERE c.application_id = ${applicationId}::uuid
    LIMIT 1
  `);
  const current = cases[0];
  if (!current) throw new AppError("Credit case not found", 404);
  if (["admin", "administrator", "super_admin"].includes(req.user!.role) && current.current_level === 3) {
    next();
    return;
  }
  if (current.assignee_id !== req.user!.userId) {
    throw new AppError("This application is not assigned to you at the current review level", 403);
  }
  next();
});

router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  if (q.length < 2) throw new AppError("Search requires at least two characters", 400);
  const like = `%${q}%`;
  const customers = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, full_name, phone, email, national_id, district, occupation,
           kyc_verified, loans_total, loans_repaid, created_at
    FROM users
    WHERE deleted_at IS NULL AND role IN ('user','customer')
      AND (full_name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR national_id ILIKE ${like})
    ORDER BY full_name LIMIT 30
  `);
  const applications = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, applicant_id, applicant_name, amount, purpose, status, loan_id, created_at
    FROM loan_applications
    WHERE id::text ILIKE ${like} OR loan_id ILIKE ${like} OR applicant_name ILIKE ${like} OR purpose ILIKE ${like}
    ORDER BY created_at DESC LIMIT 30
  `);
  const businesses = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON (e.application_id)
      e.application_id, e.business_name, e.business_location, a.applicant_id, a.applicant_name
    FROM credit_evaluations e
    JOIN loan_applications a ON a.id=e.application_id
    WHERE e.business_name ILIKE ${like} OR e.business_location ILIKE ${like}
    ORDER BY e.application_id, e.updated_at DESC LIMIT 30
  `);
  res.json({
    customers: customers.map((row) => ({ ...row, national_id: maskNin(row.national_id) })),
    applications: applications.map((row) => ({ ...row, amount: Number(row.amount) })),
    businesses,
  });
});

router.get("/staff", async (req: Request, res: Response) => {
  const requested = String(req.query.role || "").trim().toLowerCase();
  const roles = requested ? [requested] : ["officer", "manager", "admin"];
  if (roles.some((role) => !["officer", "manager", "admin"].includes(role))) throw new AppError("Invalid staff role", 400);
  const staff = await prisma.user.findMany({
    where: { role: { in: roles }, deletedAt: null },
    select: { id: true, fullName: true, email: true, phone: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    take: 200,
  });
  const loads = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT assignee_id, count(*)::int AS active_count
    FROM approval_assignments WHERE status='active' GROUP BY assignee_id
  `);
  const loadMap = new Map(loads.map((row) => [row.assignee_id, Number(row.active_count)]));
  res.json({ staff: staff.map((row) => ({ ...row, activeCases: loadMap.get(row.id) || 0 })) });
});

router.get("/intake", requirePermissions("loan.approve"), async (_req: Request, res: Response) => {
  const applications = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT a.id, a.applicant_id, a.applicant_name, a.amount, a.purpose, a.status, a.created_at,
           u.phone, u.district, u.kyc_verified,
           ua.credit_score, ua.approved_limit
    FROM loan_applications a
    JOIN users u ON u.id=a.applicant_id
    LEFT JOIN underwriting_assessments ua ON ua.application_id=a.id
    LEFT JOIN credit_cases c ON c.application_id=a.id
    WHERE c.application_id IS NULL AND a.status IN ('pending','resubmitted')
    ORDER BY a.created_at ASC
    LIMIT 200
  `);
  res.json({ applications: applications.map((row) => ({ ...row, amount: Number(row.amount), approved_limit: row.approved_limit == null ? null : Number(row.approved_limit) })) });
});

export default router;
