import prisma from "./prisma.js";
import { sendLoanExternalNotice } from "./loan-customer-notifications.js";

const LOCK_KEY = 724_001_338;
const HOUR = 60 * 60 * 1000;
const EXPIRED_TITLE = "Kuula loan offer expired";
const EXPIRED_BODY = "Your Kuula loan offer expired before it was accepted. No money was sent and you owe nothing. You can apply again in the app.";

/**
 * Closes offers whose acceptance window has passed. An offer that was never accepted
 * has no payout attached, so it simply becomes `expired`; the customer is then free to
 * apply again. Runs before every open-loan check and in the hourly sweep.
 */
export async function expireLapsedOffers(options: { userId?: string; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const lapsed = await prisma.loanApplication.findMany({
    where: { status: "offered", offerExpiresAt: { lte: now }, ...(options.userId ? { applicantId: options.userId } : {}) },
    select: { id: true, applicantId: true },
    take: 500,
  });
  let expired = 0;
  for (const offer of lapsed) {
    const changed = await prisma.loanApplication.updateMany({
      where: { id: offer.id, status: "offered", offerExpiresAt: { lte: now }, acceptedAt: null },
      data: { status: "expired", decisionNotes: "Offer expired before the customer accepted it." },
    });
    if (changed.count !== 1) continue;
    expired += 1;
    await prisma.notification.create({ data: { userId: offer.applicantId, title: EXPIRED_TITLE, body: EXPIRED_BODY, type: "loan_offer_expired:" + offer.id } });
  }
  return expired;
}

/** Once-per-offer 24-hour reminder with a DB advisory lock across API replicas. */
export async function runOfferExpirySweep(now = new Date()): Promise<{created: number; skipped: boolean}> {
  await expireLapsedOffers({ now });
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
