import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

interface PreferenceRow {
  loan_decision: boolean;
  repayment_reminders: boolean;
  overdue_alerts: boolean;
  disbursement_updates: boolean;
}

function mapPreferences(row: PreferenceRow) {
  return {
    loanDecision: row.loan_decision,
    repaymentReminders: row.repayment_reminders,
    overdueAlerts: row.overdue_alerts,
    disbursementUpdates: row.disbursement_updates,
    securityAlerts: true,
  };
}

async function preferencesFor(userId: string): Promise<PreferenceRow> {
  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    INSERT INTO notification_preferences (user_id)
    VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING loan_decision, repayment_reminders, overdue_alerts, disbursement_updates
  `;
  return rows[0];
}

// GET /api/notifications/preferences
router.get("/preferences", authenticateToken, async (req: Request, res: Response) => {
  const row = await preferencesFor(req.user!.userId);
  res.json({ preferences: mapPreferences(row) });
});

// PUT /api/notifications/preferences
router.put("/preferences", authenticateToken, async (req: Request, res: Response) => {
  const current = await preferencesFor(req.user!.userId);
  const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
  const next = {
    loanDecision: bool(req.body.loanDecision, current.loan_decision),
    repaymentReminders: bool(req.body.repaymentReminders, current.repayment_reminders),
    overdueAlerts: bool(req.body.overdueAlerts, current.overdue_alerts),
    disbursementUpdates: bool(req.body.disbursementUpdates, current.disbursement_updates),
  };

  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    UPDATE notification_preferences
    SET loan_decision = ${next.loanDecision},
        repayment_reminders = ${next.repaymentReminders},
        overdue_alerts = ${next.overdueAlerts},
        disbursement_updates = ${next.disbursementUpdates},
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ${req.user!.userId}::uuid
    RETURNING loan_decision, repayment_reminders, overdue_alerts, disbursement_updates
  `;
  res.json({ preferences: mapPreferences(rows[0]) });
});

// GET /api/notifications
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notifications });
});

// POST /api/notifications/:id/read
router.post("/:id/read", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.userId },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post("/read-all", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

export default router;
