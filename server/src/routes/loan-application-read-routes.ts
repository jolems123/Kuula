import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

interface ApplicationDetails {
  applicationId: string;
  employmentStatus: string;
  occupationOrBusiness: string;
  employerOrBusinessName: string | null;
  workDuration: string;
  incomeSource: string;
  repaymentSource: string;
}

function requiredText(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string") throw new AppError(`${label} is required`, 400);
  const normalized = value.trim();
  if (!normalized) throw new AppError(`${label} is required`, 400);
  if (normalized.length > max) throw new AppError(`${label} is too long`, 400);
  return normalized;
}

function optionalText(value: unknown, max = 120): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new AppError("Employer or business name must be text", 400);
  const normalized = value.trim();
  if (normalized.length > max) throw new AppError("Employer or business name is too long", 400);
  return normalized || null;
}

const EMPLOYMENT_STATUSES = new Set(["Employed", "Self-employed", "Business owner", "Farmer", "Casual worker", "Other"]);
const WORK_DURATIONS = new Set(["Less than 6 months", "6–12 months", "1–2 years", "2+ years"]);
const INCOME_SOURCES = new Set(["Salary", "Business", "Farming", "Commission", "Casual work", "Remittances", "Other"]);

/**
 * Validate application-only livelihood declarations before the canonical loan
 * creation route runs. The canonical route still owns affordability and loan
 * creation. We intercept its successful response only long enough to persist
 * these supplemental details; if persistence fails, the just-created pending
 * application is removed so Kuula never acknowledges an incomplete record.
 */
router.post("/applications", authenticateToken, (req: Request, res: Response, next: NextFunction) => {
  let details: Omit<ApplicationDetails, "applicationId">;
  try {
    const employmentStatus = requiredText(req.body?.employmentStatus, "Employment or livelihood status", 40);
    const workDuration = requiredText(req.body?.workDuration, "Time in current work or business", 40);
    const incomeSource = requiredText(req.body?.incomeSource, "Primary income source", 40);
    if (!EMPLOYMENT_STATUSES.has(employmentStatus)) throw new AppError("Select a valid employment or livelihood status", 400);
    if (!WORK_DURATIONS.has(workDuration)) throw new AppError("Select a valid work duration", 400);
    if (!INCOME_SOURCES.has(incomeSource)) throw new AppError("Select a valid primary income source", 400);

    details = {
      employmentStatus,
      occupationOrBusiness: requiredText(req.body?.occupationOrBusiness, "Occupation or business activity"),
      employerOrBusinessName: optionalText(req.body?.employerOrBusinessName),
      workDuration,
      incomeSource,
      repaymentSource: requiredText(req.body?.repaymentSource, "Primary repayment source"),
    };
  } catch (error) {
    next(error);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    const applicationId = body?.application?.id;
    if (res.statusCode >= 400 || typeof applicationId !== "string") return originalJson(body);

    void prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO loan_application_details (
          application_id,
          employment_status,
          occupation_or_business,
          employer_or_business_name,
          work_duration,
          income_source,
          repayment_source,
          updated_at
        ) VALUES (
          ${applicationId}::uuid,
          ${details.employmentStatus},
          ${details.occupationOrBusiness},
          ${details.employerOrBusinessName},
          ${details.workDuration},
          ${details.incomeSource},
          ${details.repaymentSource},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (application_id) DO UPDATE SET
          employment_status = EXCLUDED.employment_status,
          occupation_or_business = EXCLUDED.occupation_or_business,
          employer_or_business_name = EXCLUDED.employer_or_business_name,
          work_duration = EXCLUDED.work_duration,
          income_source = EXCLUDED.income_source,
          repayment_source = EXCLUDED.repayment_source,
          updated_at = CURRENT_TIMESTAMP
      `;
    }).then(() => {
      originalJson({
        ...body,
        application: {
          ...body.application,
          employmentStatus: details.employmentStatus,
          occupationOrBusiness: details.occupationOrBusiness,
          employerOrBusinessName: details.employerOrBusinessName,
          workDuration: details.workDuration,
          incomeSource: details.incomeSource,
          repaymentSource: details.repaymentSource,
        },
      });
    }).catch(async (error) => {
      await prisma.loanApplication.deleteMany({
        where: {
          id: applicationId,
          applicantId: req.user!.userId,
          status: "pending",
        },
      }).catch(() => undefined);
      next(error);
    });
    return res;
  }) as Response["json"];

  next();
});

async function applicationScope(req: Request) {
  const role = req.user!.role;
  const userId = req.user!.userId;

  if (role === "admin") return {};
  if (role === "officer" || role === "manager") {
    const rows = await prisma.$queryRaw<Array<{ application_id: string }>>`
      SELECT DISTINCT c.application_id
      FROM credit_cases c
      JOIN approval_assignments aa
        ON aa.application_id = c.application_id
       AND aa.level = c.current_level
       AND aa.status = 'active'
      WHERE c.current_assignee_id = ${userId}::uuid
        AND aa.assignee_id = ${userId}::uuid
        AND c.status NOT IN ('completed', 'rejected')
    `;
    return { id: { in: rows.map((row) => row.application_id) } };
  }

  return { applicantId: userId };
}

router.get("/applications", authenticateToken, async (req: Request, res: Response) => {
  const where = await applicationScope(req);
  const applications = await prisma.loanApplication.findMany({
    where,
    include: {
      underwriting: true,
      partnerFinancing: {
        include: { partner: true, partnerLocation: true, product: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const applicationIds = applications.map((application) => application.id);
  const detailsRows = applicationIds.length === 0
    ? []
    : await prisma.$queryRaw<Array<{
        application_id: string;
        employment_status: string;
        occupation_or_business: string;
        employer_or_business_name: string | null;
        work_duration: string;
        income_source: string;
        repayment_source: string;
      }>>(Prisma.sql`
        SELECT application_id::text, employment_status, occupation_or_business,
               employer_or_business_name, work_duration, income_source, repayment_source
        FROM loan_application_details
        WHERE application_id::text IN (${Prisma.join(applicationIds)})
      `);
  const detailsByApplication = new Map(detailsRows.map((row) => [row.application_id, row]));

  res.json({
    applications: applications.map((application) => {
      const details = detailsByApplication.get(application.id);
      return {
        id: application.id,
        applicantId: application.applicantId,
        applicantName: application.applicantName,
        amount: Number(application.amount),
        purpose: application.purpose,
        termDays: application.termDays,
        channel: application.channel,
        disbursementMethod: application.disbursementMethod,
        status: application.status,
        total: Number(application.total),
        apr: Number(application.apr),
        interest: Number(application.interest),
        createdAt: application.createdAt,
        decidedAt: application.decidedAt ?? null,
        decisionNotes: application.decisionNotes ?? null,
        offerExpiresAt: application.offerExpiresAt ?? null,
        underwritingStatus: application.underwriting?.status ?? null,
        employmentStatus: details?.employment_status ?? null,
        occupationOrBusiness: details?.occupation_or_business ?? null,
        employerOrBusinessName: details?.employer_or_business_name ?? null,
        workDuration: details?.work_duration ?? null,
        incomeSource: details?.income_source ?? null,
        repaymentSource: details?.repayment_source ?? null,
        partnerFinancingRequestId: application.partnerFinancing?.id ?? null,
        partnerName: application.partnerFinancing?.partner.name ?? null,
        partnerLocationName: application.partnerFinancing?.partnerLocation?.name ?? null,
        payeeName: application.partnerFinancing?.payeeName ?? null,
        invoiceReference: application.partnerFinancing?.invoiceReference ?? null,
        partnerProductName: application.partnerFinancing?.product.name ?? null,
      };
    }),
  });
});

export default router;
