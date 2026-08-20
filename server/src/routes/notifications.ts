import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

interface PreferenceRow {
  repayment_reminders: boolean;
  overdue_alerts: boolean;
}

function mapPreferences(row: PreferenceRow) {
  return {
    loanDecision: true,
    repaymentReminders: row.repayment_reminders,
    overdueAlerts: row.overdue_alerts,
    disbursementUpdates: true,
    securityAlerts: true,
  };
}

async function preferencesFor(userId: string): Promise<PreferenceRow> {
  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    INSERT INTO notification_preferences (user_id, loan_decision, disbursement_updates)
    VALUES (${userId}::uuid, TRUE, TRUE)
    ON CONFLICT (user_id) DO UPDATE
      SET loan_decision = TRUE,
          disbursement_updates = TRUE
    RETURNING repayment_reminders, overdue_alerts
  `;
  return rows[0];
}

router.get("/preferences", authenticateToken, async (req: Request, res: Response) => {
  const row = await preferencesFor(req.user!.userId);
  res.json({ preferences: mapPreferences(row) });
});

router.put("/preferences", authenticateToken, async (req: Request, res: Response) => {
  const current = await preferencesFor(req.user!.userId);
  const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
  const repaymentReminders = bool(req.body.repaymentReminders, current.repayment_reminders);
  const overdueAlerts = bool(req.body.overdueAlerts, current.overdue_alerts);

  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    UPDATE notification_preferences
    SET loan_decision = TRUE,
        repayment_reminders = ${repaymentReminders},
        overdue_alerts = ${overdueAlerts},
        disbursement_updates = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ${req.user!.userId}::uuid
    RETURNING repayment_reminders, overdue_alerts
  `;
  res.json({ preferences: mapPreferences(rows[0]) });
});

router.get("/", authenticateToken, async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notifications });
});

router.post("/:id/read", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.userId },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

router.post("/read-all", authenticateToken, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

export default router;
