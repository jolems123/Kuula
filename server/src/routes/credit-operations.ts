import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { accessFieldEvidence, saveFieldEvidence } from "../lib/field-evidence-storage.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("loan.review"));

const LEVEL_ROLE: Record<number, string> = { 1: "officer", 2: "manager", 3: "admin" };
const LEVEL_STATUS: Record<number, string> = { 1: "field_evaluation", 2: "level2_review", 3: "final_review" };
const EVIDENCE_TYPES = new Set(["storefront", "business_interior", "stock", "equipment", "licence", "supplier_invoice", "applicant_at_business", "other"]);

function asId(value: unknown, label: string): string {
  const id = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(`${label} is invalid`, 400);
  return id;
}
function text(value: unknown, max = 5000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function money(value: unknown): bigint | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) throw new AppError("Amount is invalid", 400);
  return BigInt(n);
}
function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new AppError("Numeric value is invalid", 400);
  return n;
}
function roleLevel(role: string): number {
  if (role === "officer") return 1;
  if (role === "manager") return 2;
  if (role === "admin") return 3;
  return 0;
}

async function assertApplication(applicationId: string) {
  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { applicant: true, underwriting: true },
  });
  if (!application) throw new AppError("Application not found", 404);
  return application;
}

async function caseRow(applicationId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT application_id, customer_id, current_level, status, current_assignee_id,
           started_at, updated_at, completed_at
    FROM credit_cases WHERE application_id = ${applicationId}::uuid LIMIT 1
  `);
  return rows[0] ?? null;
}

async function assertAssigned(applicationId: string, userId: string, level: number, role: string) {
  if (role === "admin" && level === 3) return;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM approval_assignments
    WHERE application_id = ${applicationId}::uuid
      AND level = ${level}
      AND assignee_id = ${userId}::uuid
      AND status = 'active'
    LIMIT 1
  `);
  if (!rows[0]) throw new AppError("This application is not assigned to you at the current review level", 403);
}

async function event(applicationId: string, actorId: string | null, eventType: string, fromLevel?: number | null, toLevel?: number | null, detail: Record<string, unknown> = {}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO credit_operation_events (id, application_id, actor_id, event_type, from_level, to_level, detail)
    VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${actorId}::uuid, ${eventType}, ${fromLevel ?? null}, ${toLevel ?? null}, ${JSON.stringify(detail)}::jsonb)
  `);
}

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
      AND aa.level = c.current_level AND aa.status = 'active'
    WHERE c.current_level = ${level}
      AND c.status NOT IN ('completed','rejected')
      AND (${req.user!.role === "admin"}::boolean OR aa.assignee_id = ${userId}::uuid)
    ORDER BY c.updated_at ASC
    LIMIT 200
  `);
  const counts = queue.reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  res.json({ level, role: req.user!.role, counts, queue: queue.map((row) => ({ ...row, amount: Number(row.amount), approved_limit: row.approved_limit == null ? null : Number(row.approved_limit) })) });
});

router.post("/applications/:id/assign", requirePermissions("loan.approve"), async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  const application = await assertApplication(applicationId);
  const level = Math.max(1, Math.min(3, Number(req.body?.level) || 1));
  const assigneeId = asId(req.body?.assigneeId, "Assignee ID");
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, role: true, fullName: true, deletedAt: true } });
  if (!assignee || assignee.deletedAt) throw new AppError("Assignee not found", 404);
  if (assignee.role !== LEVEL_ROLE[level]) throw new AppError(`Level ${level} must be assigned to a ${LEVEL_ROLE[level]}`, 422);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO credit_cases (application_id, customer_id, current_level, status, current_assignee_id)
      VALUES (${applicationId}::uuid, ${application.applicantId}::uuid, ${level}, ${LEVEL_STATUS[level]}, ${assigneeId}::uuid)
      ON CONFLICT (application_id) DO UPDATE SET
        current_level = EXCLUDED.current_level,
        status = EXCLUDED.status,
        current_assignee_id = EXCLUDED.current_assignee_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE approval_assignments SET status = 'reassigned', completed_at = CURRENT_TIMESTAMP
      WHERE application_id = ${applicationId}::uuid AND level = ${level} AND status = 'active'
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO approval_assignments (id, application_id, level, assignee_id, assigned_by)
      VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${level}, ${assigneeId}::uuid, ${req.user!.userId}::uuid)
    `);
  });
  await event(applicationId, req.user!.userId, "application.assigned", null, level, { assigneeId, assigneeName: assignee.fullName });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.application_assigned", resourceType: "loan_application", resourceId: applicationId, metadata: { level, assigneeId } });
  res.json({ ok: true, level, assignee: { id: assignee.id, name: assignee.fullName, role: assignee.role } });
});

router.get("/applications/:id", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  const application = await assertApplication(applicationId);
  const [caseData, evaluations, evidence, actions, assignments, messages, events] = await Promise.all([
    caseRow(applicationId),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM credit_evaluations WHERE application_id = ${applicationId}::uuid ORDER BY version DESC`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, evaluation_id, evidence_type, mime, bytes, gps_latitude, gps_longitude, captured_at, created_at, uploaded_by FROM evaluation_evidence WHERE application_id = ${applicationId}::uuid ORDER BY created_at`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT aa.*, u.full_name AS actor_name, u.role AS actor_role FROM approval_actions aa JOIN users u ON u.id = aa.actor_id WHERE aa.application_id = ${applicationId}::uuid ORDER BY aa.created_at`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT a.*, u.full_name AS assignee_name, u.role AS assignee_role FROM approval_assignments a JOIN users u ON u.id = a.assignee_id WHERE a.application_id = ${applicationId}::uuid ORDER BY a.assigned_at`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT m.*, u.full_name AS sender_name, u.role AS sender_role FROM application_messages m JOIN users u ON u.id = m.sender_id WHERE m.application_id = ${applicationId}::uuid ORDER BY m.created_at`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT e.*, u.full_name AS actor_name FROM credit_operation_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.application_id = ${applicationId}::uuid ORDER BY e.created_at`),
  ]);
  res.json({
    application: {
      id: application.id, applicantId: application.applicantId, applicantName: application.applicantName,
      amount: Number(application.amount), purpose: application.purpose, termDays: application.termDays,
      status: application.status, createdAt: application.createdAt,
      customer: { id: application.applicant.id, name: application.applicant.fullName, phone: application.applicant.phone, email: application.applicant.email, district: application.applicant.district, occupation: application.applicant.occupation, kycVerified: application.applicant.kycVerified },
      underwriting: application.underwriting ? { creditScore: application.underwriting.creditScore, approvedLimit: Number(application.underwriting.approvedLimit), disposableIncome: Number(application.underwriting.disposableIncome), maxAffordablePayment: Number(application.underwriting.maxAffordablePayment), status: application.underwriting.status, flags: application.underwriting.flags } : null,
    },
    case: caseData,
    evaluations: evaluations.map((r) => ({ ...r, estimated_monthly_sales: r.estimated_monthly_sales == null ? null : Number(r.estimated_monthly_sales), estimated_stock_value: r.estimated_stock_value == null ? null : Number(r.estimated_stock_value), monthly_operating_expenses: r.monthly_operating_expenses == null ? null : Number(r.monthly_operating_expenses), existing_business_debt: r.existing_business_debt == null ? null : Number(r.existing_business_debt), recommended_amount: r.recommended_amount == null ? null : Number(r.recommended_amount) })),
    evidence, actions: actions.map((r) => ({ ...r, recommended_amount: r.recommended_amount == null ? null : Number(r.recommended_amount) })), assignments, messages, events,
  });
});

router.post("/applications/:id/evaluation", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  await assertApplication(applicationId);
  const c = await caseRow(applicationId);
  if (!c || c.current_level !== 1) throw new AppError("Application is not in field evaluation", 409);
  await assertAssigned(applicationId, req.user!.userId, 1, req.user!.role);
  if (req.user!.role !== "officer" && req.user!.role !== "admin") throw new AppError("Only the assigned field officer can edit the field evaluation", 403);

  const existing = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, version FROM credit_evaluations WHERE application_id = ${applicationId}::uuid ORDER BY version DESC LIMIT 1`);
  const evaluationId = existing[0]?.id || crypto.randomUUID();
  const version = existing[0]?.version || 1;
  const fields = req.body || {};
  const data = {
    businessName: text(fields.businessName, 200), businessType: text(fields.businessType, 120), businessLocation: text(fields.businessLocation, 300),
    yearsOperating: numberOrNull(fields.yearsOperating), employeeCount: numberOrNull(fields.employeeCount),
    estimatedMonthlySales: money(fields.estimatedMonthlySales), estimatedStockValue: money(fields.estimatedStockValue), monthlyOperatingExpenses: money(fields.monthlyOperatingExpenses), existingBusinessDebt: money(fields.existingBusinessDebt),
    businessObservations: text(fields.businessObservations), financialObservations: text(fields.financialObservations), characterAssessment: text(fields.characterAssessment), repaymentCapacity: text(fields.repaymentCapacity), risks: text(fields.risks), mitigatingFactors: text(fields.mitigatingFactors), purposeAssessment: text(fields.purposeAssessment), recommendation: text(fields.recommendation),
    recommendedAmount: money(fields.recommendedAmount), recommendedTermDays: numberOrNull(fields.recommendedTermDays), gpsLatitude: numberOrNull(fields.gpsLatitude), gpsLongitude: numberOrNull(fields.gpsLongitude),
  };
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO credit_evaluations (
      id, application_id, officer_id, version, status, business_name, business_type, business_location,
      years_operating, employee_count, estimated_monthly_sales, estimated_stock_value, monthly_operating_expenses,
      existing_business_debt, business_observations, financial_observations, character_assessment, repayment_capacity,
      risks, mitigating_factors, purpose_assessment, recommendation, recommended_amount, recommended_term_days,
      gps_latitude, gps_longitude, visit_started_at, updated_at
    ) VALUES (
      ${evaluationId}::uuid, ${applicationId}::uuid, ${req.user!.userId}::uuid, ${version}, 'draft', ${data.businessName || null}, ${data.businessType || null}, ${data.businessLocation || null},
      ${data.yearsOperating}, ${data.employeeCount}, ${data.estimatedMonthlySales}, ${data.estimatedStockValue}, ${data.monthlyOperatingExpenses}, ${data.existingBusinessDebt},
      ${data.businessObservations || null}, ${data.financialObservations || null}, ${data.characterAssessment || null}, ${data.repaymentCapacity || null}, ${data.risks || null}, ${data.mitigatingFactors || null}, ${data.purposeAssessment || null}, ${data.recommendation || null}, ${data.recommendedAmount}, ${data.recommendedTermDays},
      ${data.gpsLatitude}, ${data.gpsLongitude}, COALESCE((SELECT visit_started_at FROM credit_evaluations WHERE id = ${evaluationId}::uuid), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
    )
    ON CONFLICT (application_id, version) DO UPDATE SET
      business_name = EXCLUDED.business_name, business_type = EXCLUDED.business_type, business_location = EXCLUDED.business_location,
      years_operating = EXCLUDED.years_operating, employee_count = EXCLUDED.employee_count,
      estimated_monthly_sales = EXCLUDED.estimated_monthly_sales, estimated_stock_value = EXCLUDED.estimated_stock_value,
      monthly_operating_expenses = EXCLUDED.monthly_operating_expenses, existing_business_debt = EXCLUDED.existing_business_debt,
      business_observations = EXCLUDED.business_observations, financial_observations = EXCLUDED.financial_observations,
      character_assessment = EXCLUDED.character_assessment, repayment_capacity = EXCLUDED.repayment_capacity,
      risks = EXCLUDED.risks, mitigating_factors = EXCLUDED.mitigating_factors, purpose_assessment = EXCLUDED.purpose_assessment,
      recommendation = EXCLUDED.recommendation, recommended_amount = EXCLUDED.recommended_amount,
      recommended_term_days = EXCLUDED.recommended_term_days, gps_latitude = EXCLUDED.gps_latitude,
      gps_longitude = EXCLUDED.gps_longitude, updated_at = CURRENT_TIMESTAMP
  `);
  await event(applicationId, req.user!.userId, "evaluation.saved", 1, 1, { evaluationId, version });
  res.json({ ok: true, evaluationId, version });
});

router.post("/applications/:id/evidence", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  await assertApplication(applicationId);
  const c = await caseRow(applicationId);
  if (!c || c.current_level !== 1) throw new AppError("Field evidence can only be added during Level 1 evaluation", 409);
  await assertAssigned(applicationId, req.user!.userId, 1, req.user!.role);
  const evidenceType = text(req.body?.evidenceType, 60).toLowerCase().replace(/\s+/g, "_");
  if (!EVIDENCE_TYPES.has(evidenceType)) throw new AppError("Unsupported evidence type", 400);
  const evaluation = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id FROM credit_evaluations WHERE application_id = ${applicationId}::uuid ORDER BY version DESC LIMIT 1`);
  if (!evaluation[0]) throw new AppError("Save the field evaluation before uploading evidence", 409);
  const stored = await saveFieldEvidence({ applicationId, evaluationId: evaluation[0].id, evidenceType, dataUrl: String(req.body?.dataUrl || "") });
  const evidenceId = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO evaluation_evidence (id, evaluation_id, application_id, uploaded_by, evidence_type, storage_key, mime, bytes, gps_latitude, gps_longitude, captured_at, metadata)
    VALUES (${evidenceId}::uuid, ${evaluation[0].id}::uuid, ${applicationId}::uuid, ${req.user!.userId}::uuid, ${evidenceType}, ${stored.key}, ${stored.mime}, ${stored.bytes}, ${numberOrNull(req.body?.gpsLatitude)}, ${numberOrNull(req.body?.gpsLongitude)}, ${req.body?.capturedAt ? new Date(String(req.body.capturedAt)) : null}, ${JSON.stringify({ source: "field_officer" })}::jsonb)
  `);
  await event(applicationId, req.user!.userId, "evidence.uploaded", 1, 1, { evidenceId, evidenceType });
  res.status(201).json({ evidence: { id: evidenceId, evidenceType, mime: stored.mime, bytes: stored.bytes } });
});

router.get("/evidence/:evidenceId/access", requirePermissions("customer.view"), async (req: Request, res: Response) => {
  const evidenceId = asId(req.params.evidenceId, "Evidence ID");
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, application_id, storage_key, mime FROM evaluation_evidence WHERE id = ${evidenceId}::uuid LIMIT 1`);
  const evidence = rows[0];
  if (!evidence) throw new AppError("Evidence not found", 404);
  const access = await accessFieldEvidence(evidence.storage_key, evidence.mime);
  await event(evidence.application_id, req.user!.userId, "evidence.viewed", null, null, { evidenceId });
  await writeAuditEvent({ actorId: req.user!.userId, action: "credit.field_evidence_viewed", resourceType: "evaluation_evidence", resourceId: evidenceId, metadata: { applicationId: evidence.application_id } });
  if (access.kind === "url") { res.json({ url: access.url, expiresInSeconds: access.expiresInSeconds }); return; }
  res.setHeader("Content-Type", access.mime); res.setHeader("Cache-Control", "private, no-store"); res.send(access.buffer);
});

router.post("/applications/:id/submit", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  const application = await assertApplication(applicationId);
  const c = await caseRow(applicationId);
  if (!c) throw new AppError("Credit case has not been assigned", 409);
  const level = Number(c.current_level);
  await assertAssigned(applicationId, req.user!.userId, level, req.user!.role);
  const narrative = text(req.body?.narrative);
  if (narrative.length < 40) throw new AppError("A substantive review narrative of at least 40 characters is required", 400);
  const nextAssigneeId = req.body?.nextAssigneeId ? asId(req.body.nextAssigneeId, "Next assignee ID") : null;

  if (level === 1) {
    const evaluations = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, business_observations, financial_observations, repayment_capacity, recommendation, recommended_amount, recommended_term_days FROM credit_evaluations WHERE application_id = ${applicationId}::uuid ORDER BY version DESC LIMIT 1`);
    const ev = evaluations[0];
    if (!ev || !ev.business_observations || !ev.financial_observations || !ev.repayment_capacity || !ev.recommendation || !ev.recommended_amount || !ev.recommended_term_days) throw new AppError("Complete the required field evaluation narrative and recommendation before submitting", 409);
    const evidence = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS count FROM evaluation_evidence WHERE application_id = ${applicationId}::uuid`);
    if (Number(evidence[0]?.count || 0) < 2) throw new AppError("At least two field evidence images/documents are required before Level 1 submission", 409);
    await prisma.$executeRaw(Prisma.sql`UPDATE credit_evaluations SET status='submitted', submitted_at=CURRENT_TIMESTAMP, visit_completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=${ev.id}::uuid`);
  }
  if (level >= 2) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO approval_actions (id, application_id, level, actor_id, action, narrative, recommended_amount, recommended_term_days)
      VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${level}, ${req.user!.userId}::uuid, ${level === 2 ? "recommend" : "final_review"}, ${narrative}, ${money(req.body?.recommendedAmount)}, ${numberOrNull(req.body?.recommendedTermDays)})
    `);
  }

  if (level === 3) throw new AppError("Use the final decision action at Level 3", 409);
  const nextLevel = level + 1;
  if (!nextAssigneeId) throw new AppError(`Select the Level ${nextLevel} approver before submitting`, 400);
  const next = await prisma.user.findUnique({ where: { id: nextAssigneeId }, select: { id: true, role: true, fullName: true, deletedAt: true } });
  if (!next || next.deletedAt || next.role !== LEVEL_ROLE[nextLevel]) throw new AppError(`The next approver must have role ${LEVEL_ROLE[nextLevel]}`, 422);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`UPDATE approval_assignments SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid AND level=${level} AND assignee_id=${req.user!.userId}::uuid AND status='active'`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO approval_assignments (id, application_id, level, assignee_id, assigned_by) VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${nextLevel}, ${nextAssigneeId}::uuid, ${req.user!.userId}::uuid)`);
    await tx.$executeRaw(Prisma.sql`UPDATE credit_cases SET current_level=${nextLevel}, status=${LEVEL_STATUS[nextLevel]}, current_assignee_id=${nextAssigneeId}::uuid, updated_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid`);
  });
  await event(applicationId, req.user!.userId, "application.escalated", level, nextLevel, { narrative, nextAssigneeId, nextAssigneeName: next.fullName });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.application_escalated", resourceType: "loan_application", resourceId: applicationId, metadata: { fromLevel: level, toLevel: nextLevel, nextAssigneeId } });
  res.json({ ok: true, fromLevel: level, toLevel: nextLevel, assignee: { id: next.id, name: next.fullName } });
});

router.post("/applications/:id/decision", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  const application = await assertApplication(applicationId);
  const c = await caseRow(applicationId);
  if (!c) throw new AppError("Credit case not found", 404);
  const level = Number(c.current_level);
  await assertAssigned(applicationId, req.user!.userId, level, req.user!.role);
  const action = text(req.body?.action, 30);
  const narrative = text(req.body?.narrative);
  if (!["return", "reject", "approve"].includes(action)) throw new AppError("Action must be return, reject, or approve", 400);
  if (narrative.length < 40) throw new AppError("A substantive decision narrative of at least 40 characters is required", 400);
  if (action === "approve" && level !== 3) throw new AppError("Only Level 3 can make the final approval", 403);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO approval_actions (id, application_id, level, actor_id, action, narrative, recommended_amount, recommended_term_days)
    VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${level}, ${req.user!.userId}::uuid, ${action}, ${narrative}, ${money(req.body?.recommendedAmount)}, ${numberOrNull(req.body?.recommendedTermDays)})
  `);

  if (action === "return") {
    const returnLevel = level === 1 ? 1 : Math.max(1, Number(req.body?.returnToLevel) || level - 1);
    const targetId = asId(req.body?.assigneeId, "Return assignee ID");
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, fullName: true } });
    if (!target || target.role !== LEVEL_ROLE[returnLevel]) throw new AppError(`Return assignee must be a ${LEVEL_ROLE[returnLevel]}`, 422);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`UPDATE approval_assignments SET status='returned', completed_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid AND level=${level} AND status='active'`);
      await tx.$executeRaw(Prisma.sql`UPDATE approval_assignments SET status='returned', completed_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid AND level=${returnLevel} AND status='active'`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO approval_assignments (id, application_id, level, assignee_id, assigned_by) VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, ${returnLevel}, ${targetId}::uuid, ${req.user!.userId}::uuid)`);
      await tx.$executeRaw(Prisma.sql`UPDATE credit_cases SET current_level=${returnLevel}, status='returned_for_clarification', current_assignee_id=${targetId}::uuid, updated_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid`);
    });
    await event(applicationId, req.user!.userId, "application.returned", level, returnLevel, { narrative, assigneeId: targetId });
    res.json({ ok: true, status: "returned_for_clarification", level: returnLevel }); return;
  }

  if (action === "reject") {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`UPDATE approval_assignments SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid AND status='active'`);
      await tx.$executeRaw(Prisma.sql`UPDATE credit_cases SET status='rejected', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid`);
      await tx.loanApplication.update({ where: { id: applicationId }, data: { status: "rejected", decisionNotes: narrative, decidedAt: new Date() } });
    });
    await event(applicationId, req.user!.userId, "application.rejected", level, null, { narrative });
    await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.application_rejected", resourceType: "loan_application", resourceId: applicationId, metadata: { level, narrative } });
    res.json({ ok: true, status: "rejected" }); return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`UPDATE approval_assignments SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid AND level=3 AND status='active'`);
    await tx.$executeRaw(Prisma.sql`UPDATE credit_cases SET status='ready_for_offer', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE application_id=${applicationId}::uuid`);
  });
  await event(applicationId, req.user!.userId, "application.final_approved", 3, null, { narrative });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.final_approval_recorded", resourceType: "loan_application", resourceId: applicationId, metadata: { narrative, canonicalDecisionRequired: true } });
  res.json({ ok: true, status: "ready_for_offer", canonicalDecisionRequired: true, canonicalEndpoint: "/api/loans/applications/decision" });
});

router.get("/applications/:id/messages", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  await assertApplication(applicationId);
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT m.id, m.sender_id, m.recipient_id, m.message_type, m.content, m.created_at, u.full_name AS sender_name, u.role AS sender_role FROM application_messages m JOIN users u ON u.id=m.sender_id WHERE m.application_id=${applicationId}::uuid ORDER BY m.created_at`);
  res.json({ messages: rows });
});

router.post("/applications/:id/messages", async (req: Request, res: Response) => {
  const applicationId = asId(req.params.id, "Application ID");
  const application = await assertApplication(applicationId);
  const content = text(req.body?.content, 3000);
  if (!content) throw new AppError("Message is required", 400);
  const recipientId = req.body?.recipientId ? asId(req.body.recipientId, "Recipient ID") : null;
  const messageType = req.body?.messageType === "customer" ? "customer" : "internal";
  if (messageType === "customer" && !["admin", "manager", "officer"].includes(req.user!.role)) throw new AppError("Staff role required", 403);
  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`INSERT INTO application_messages (id, application_id, sender_id, recipient_id, message_type, content) VALUES (${id}::uuid, ${applicationId}::uuid, ${req.user!.userId}::uuid, ${recipientId}::uuid, ${messageType}, ${content})`);
  await event(applicationId, req.user!.userId, "message.posted", null, null, { messageId: id, messageType, recipientId });
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: application.applicantId, action: "credit.application_message_posted", resourceType: "loan_application", resourceId: applicationId, metadata: { messageType, recipientId } });
  res.status(201).json({ message: { id, applicationId, content, messageType, recipientId, createdAt: new Date().toISOString() } });
});

router.get("/search", requirePermissions("customer.view"), async (req: Request, res: Response) => {
  const q = text(req.query.q, 120);
  if (q.length < 2) throw new AppError("Search requires at least two characters", 400);
  const like = `%${q}%`;
  const customers = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, full_name, phone, email, national_id, district, occupation, kyc_verified, loans_total, loans_repaid, created_at
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
    SELECT DISTINCT ON (e.application_id) e.application_id, e.business_name, e.business_location, a.applicant_id, a.applicant_name
    FROM credit_evaluations e JOIN loan_applications a ON a.id=e.application_id
    WHERE e.business_name ILIKE ${like} OR e.business_location ILIKE ${like}
    ORDER BY e.application_id, e.updated_at DESC LIMIT 30
  `);
  res.json({ customers, applications: applications.map((a) => ({ ...a, amount: Number(a.amount) })), businesses });
});

router.get("/customers/:id/360", requirePermissions("customer.view"), async (req: Request, res: Response) => {
  const customerId = asId(req.params.id, "Customer ID");
  const user = await prisma.user.findUnique({ where: { id: customerId }, select: { id: true, fullName: true, phone: true, email: true, nationalId: true, dateOfBirth: true, district: true, occupation: true, kycVerified: true, phoneVerified: true, loansTotal: true, loansRepaid: true, createdAt: true } });
  if (!user) throw new AppError("Customer not found", 404);
  const [applications, repayments, transactions, cases, kyc, evidence, messages, audit] = await Promise.all([
    prisma.loanApplication.findMany({ where: { applicantId: customerId }, include: { underwriting: true }, orderBy: { createdAt: "desc" } }),
    prisma.repayment.findMany({ where: { userId: customerId }, orderBy: { createdAt: "desc" } }),
    prisma.transaction.findMany({ where: { userId: customerId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT c.* FROM credit_cases c WHERE c.customer_id=${customerId}::uuid ORDER BY c.updated_at DESC`),
    prisma.kycSubmission.findMany({ where: { userId: customerId }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, submittedAt: true, reviewedAt: true, decisionReason: true } }),
    prisma.creditEvidence.findMany({ where: { userId: customerId }, orderBy: { observedAt: "desc" }, select: { id: true, sourceType: true, provider: true, observedAt: true, expiresAt: true, status: true, revokedAt: true } }),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT m.application_id, m.sender_id, m.message_type, m.content, m.created_at, u.full_name AS sender_name FROM application_messages m JOIN users u ON u.id=m.sender_id JOIN loan_applications a ON a.id=m.application_id WHERE a.applicant_id=${customerId}::uuid ORDER BY m.created_at DESC LIMIT 200`),
    prisma.auditEvent.findMany({ where: { subjectUserId: customerId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  res.json({
    customer: { ...user, nationalId: user.nationalId ? `${user.nationalId.slice(0, 4)}••••${user.nationalId.slice(-2)}` : null },
    applications: applications.map((a) => ({ id: a.id, amount: Number(a.amount), purpose: a.purpose, status: a.status, total: Number(a.total), createdAt: a.createdAt, creditScore: a.underwriting?.creditScore ?? null, approvedLimit: a.underwriting ? Number(a.underwriting.approvedLimit) : null })),
    repayments: repayments.map((r) => ({ ...r, total: Number(r.total), amountPaid: Number(r.amountPaid) })),
    transactions: transactions.map((t) => ({ id: t.id, loanId: t.loanId, type: t.type, amount: Number(t.amount), status: t.status, createdAt: t.createdAt })),
    cases, kyc, creditEvidence: evidence, applicationMessages: messages, audit,
  });
});

export default router;
