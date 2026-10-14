import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";

/**
 * Approval authority per staff role. The limits are policy, set by the super admin
 * (GET/PUT /api/admin/credit-authority-limits) and audited; none are written in code.
 * A role without a configured limit keeps the behaviour from before limits existed.
 */
export async function authorityLimitFor(role: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ max_amount: bigint }>>(Prisma.sql`
    SELECT max_amount FROM credit_authority_limits WHERE role=${role} LIMIT 1
  `);
  return rows[0] ? Number(rows[0].max_amount) : null;
}

export async function assertWithinApprovalAuthority(role: string, amount: number): Promise<void> {
  const limit = await authorityLimitFor(role);
  if (limit !== null && amount > limit) {
    throw new AppError(
      `UGX ${amount.toLocaleString()} exceeds your approval authority of UGX ${limit.toLocaleString()}. Escalate to a role with higher authority.`,
      403,
    );
  }
}

export async function listAuthorityLimits() {
  const rows = await prisma.$queryRaw<Array<{ role: string; max_amount: bigint; updated_by: string; updated_at: Date }>>(Prisma.sql`
    SELECT role, max_amount, updated_by, updated_at FROM credit_authority_limits ORDER BY max_amount
  `);
  return rows.map((row) => ({ ...row, max_amount: Number(row.max_amount) }));
}

export async function setAuthorityLimit(role: string, maxAmount: number | null, updatedBy: string): Promise<void> {
  if (maxAmount === null) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM credit_authority_limits WHERE role=${role}`);
    return;
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO credit_authority_limits (role, max_amount, updated_by) VALUES (${role}, ${BigInt(maxAmount)}, ${updatedBy}::uuid)
    ON CONFLICT (role) DO UPDATE SET max_amount=EXCLUDED.max_amount, updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP
  `);
}
