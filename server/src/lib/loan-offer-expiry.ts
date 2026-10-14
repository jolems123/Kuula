import prisma from "./prisma.js";
import { sendLoanExternalNotice } from "./loan-customer-notifications.js";

const LOCK_KEY = 724_001_338;
const HOUR = 60 * 60 * 1000;

/** Once-per-offer 24-hour reminder with a DB advisory lock across API replicas. */
export async function runOfferExpirySweep(now = new Date()): Promise<{created: number; skipped: boolean}> {
  const notices = await prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{locked: boolean}>>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
    if (!lock?.locked) return null;
    const offers = await tx.loanApplication.findMany({
      where: { status: "offered", offerExpiresAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
      select: { id: true, applicantId: true, offerExpiresAt: true },
      take: 200,
    });
    const created: Array<{userId: string; title: string; body: string}> = [];
    for (const offer of offers) {
      const type = "loan_offer_expiring:" + offer.id;
      const exists = await tx.notification.findFirst({ where: { userId: offer.applicantId, type }, select: { id: true } });
      if (exists) continue;
      const title = "Kuula loan offer expires soon";
      const body = "Your Kuula loan offer is due to expire within 24 hours. Open the app to review the exact agreement. No funds are sent until you accept and authorized staff release payment.";
      await tx.notification.create({ data: { userId: offer.applicantId, title, body, type } });
      created.push({ userId: offer.applicantId, title, body });
    }
    return created;
  });
  if (!notices) return { created: 0, skipped: true };
  for (const note of notices) await sendLoanExternalNotice(note.userId, note.title, note.body);
  return { created: notices.length, skipped: false };
}

export function startOfferExpirySweeper(): () => void {
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_OFFER_EXPIRY_SWEEPER !== "true") return () => {};
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try { await runOfferExpirySweep(); }
    catch (error) { console.error("loan.offer_expiry_sweep_failed", error instanceof Error ? error.message : "unknown"); }
    finally { busy = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), HOUR);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
