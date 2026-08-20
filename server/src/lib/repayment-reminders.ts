import prisma from "./prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_LOCK_KEY = 724_001_337;

export type RepaymentReminderKind = "due_7d" | "due_3d" | "due_1d" | "overdue";

export function classifyRepaymentReminder(dueDate: Date, now = new Date()): RepaymentReminderKind | null {
  const diff = dueDate.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff <= DAY_MS) return "due_1d";
  if (diff <= 3 * DAY_MS) return "due_3d";
  if (diff <= 7 * DAY_MS) return "due_7d";
  return null;
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reminderType(repaymentId: string, kind: RepaymentReminderKind, now: Date): string {
  const suffix = kind === "overdue" ? utcDateKey(now) : kind;
  return `repayment_reminder:${repaymentId}:${suffix}`;
}

function reminderCopy(kind: RepaymentReminderKind, remaining: bigint, dueDate: Date): { title: string; body: string } {
  const amount = `UGX ${Number(remaining).toLocaleString("en-UG")}`;
  const due = dueDate.toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric", timeZone: "Africa/Kampala" });
  if (kind === "overdue") {
    return {
      title: "Repayment overdue",
      body: `${amount} is overdue. Please make your repayment as soon as possible or contact Kuula support if you need help.`,
    };
  }
  const lead = kind === "due_1d" ? "tomorrow" : kind === "due_3d" ? "in 3 days" : "in 7 days";
  return {
    title: "Repayment reminder",
    body: `${amount} is due ${lead} (${due}). Please ensure your Mobile Money account is ready before the due date.`,
  };
}

export async function runRepaymentReminderSweep(now = new Date()): Promise<{ scanned: number; created: number; overdueUpdated: number; skipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${REMINDER_LOCK_KEY}) AS locked`;
    if (!rows[0]?.locked) return { scanned: 0, created: 0, overdueUpdated: 0, skipped: true };

    const horizon = new Date(now.getTime() + 7 * DAY_MS);
    const repayments = await tx.repayment.findMany({
      where: {
        status: { not: "paid" },
        dueDate: { lte: horizon },
        total: { gt: 0 },
      },
      select: { id: true, userId: true, total: true, amountPaid: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
    });

    let created = 0;
    let overdueUpdated = 0;

    for (const repayment of repayments) {
      const remaining = repayment.total - repayment.amountPaid;
      if (remaining <= 0n) continue;
      const kind = classifyRepaymentReminder(repayment.dueDate, now);
      if (!kind) continue;

      if (kind === "overdue" && repayment.status !== "overdue") {
        await tx.repayment.update({ where: { id: repayment.id }, data: { status: "overdue" } });
        overdueUpdated += 1;
      }

      const prefs = await tx.$queryRaw<Array<{ repayment_reminders: boolean; overdue_alerts: boolean }>>`
        SELECT repayment_reminders, overdue_alerts
        FROM notification_preferences
        WHERE user_id = ${repayment.userId}::uuid
      `;
      const enabled = prefs.length === 0
        || (kind === "overdue" ? prefs[0].overdue_alerts : prefs[0].repayment_reminders);
      if (!enabled) continue;

      const type = reminderType(repayment.id, kind, now);
      const alreadySent = await tx.notification.findFirst({
        where: { userId: repayment.userId, type },
        select: { id: true },
      });
      if (alreadySent) continue;

      const copy = reminderCopy(kind, remaining, repayment.dueDate);
      await tx.notification.create({
        data: {
          userId: repayment.userId,
          title: copy.title,
          body: copy.body,
          type,
        },
      });
      created += 1;
    }

    return { scanned: repayments.length, created, overdueUpdated, skipped: false };
  });
}

export function startRepaymentReminderSweeper(): () => void {
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_REPAYMENT_REMINDER_SWEEPER !== "true") return () => {};

  const intervalMs = Math.max(5 * 60 * 1000, Number(process.env.REPAYMENT_REMINDER_SWEEP_MS || 15 * 60 * 1000));
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runRepaymentReminderSweep();
      if (result.created > 0 || result.overdueUpdated > 0) {
        console.log(JSON.stringify({ event: "repayment.reminder_sweep", ...result }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "repayment.reminder_sweep_failed",
        error: error instanceof Error ? error.message : "Unknown reminder sweep error",
      }));
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
