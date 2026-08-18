import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

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

  res.json({
    applications: applications.map((application) => ({
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
      partnerFinancingRequestId: application.partnerFinancing?.id ?? null,
      partnerName: application.partnerFinancing?.partner.name ?? null,
      partnerLocationName: application.partnerFinancing?.partnerLocation?.name ?? null,
      payeeName: application.partnerFinancing?.payeeName ?? null,
      invoiceReference: application.partnerFinancing?.invoiceReference ?? null,
      partnerProductName: application.partnerFinancing?.product.name ?? null,
    })),
  });
});

export default router;
