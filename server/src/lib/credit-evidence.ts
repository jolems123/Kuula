import type { CreditEvidence, PrismaClient } from "@prisma/client";
import prisma from "./prisma.js";

export interface EffectiveCreditEvidence {
  momoMonths: number;
  momoTxnCount: number;
  crbStatus: string;
  momoVerified: boolean;
  crbVerified: boolean;
  evidenceIds: string[];
}

function isCurrent(row: CreditEvidence, now: Date): boolean {
  return row.status === "verified" && !row.revokedAt && row.observedAt <= now && row.expiresAt > now;
}

export async function effectiveCreditEvidence(
  userId: string,
  client: PrismaClient | typeof prisma = prisma,
  now = new Date()
): Promise<EffectiveCreditEvidence> {
  const rows = await client.creditEvidence.findMany({
    where: {
      userId,
      status: "verified",
      revokedAt: null,
      observedAt: { lte: now },
      expiresAt: { gt: now },
    },
    orderBy: { observedAt: "desc" },
  });

  const current = rows.filter((row) => isCurrent(row, now));
  const momo = current.find((row) => row.sourceType === "mobile_money");
  const crb = current.find((row) => row.sourceType === "crb");

  return {
    momoMonths: momo?.momoMonths ?? 0,
    momoTxnCount: momo?.momoTxnCount ?? 0,
    crbStatus: crb?.crbStatus ?? "thin",
    momoVerified: !!momo,
    crbVerified: !!crb,
    evidenceIds: [momo?.id, crb?.id].filter((value): value is string => !!value),
  };
}

export function evidenceExpiryDays(sourceType: string): number {
  if (sourceType === "crb") return 30;
  if (sourceType === "mobile_money") return 30;
  return 14;
}
