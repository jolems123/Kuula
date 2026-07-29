/**
 * Row-level locking helpers.
 *
 * Every financial decision in Kuula is made while holding a `SELECT … FOR
 * UPDATE` lock on the row it mutates. This is what makes the concurrency cases
 * in C-06 safe: two admins approving at once, a double-clicked button, a client
 * retry, and two server instances processing the same request all serialise on
 * the same row, and the second one through observes the state the first one
 * committed.
 *
 * `FOR UPDATE NOWAIT` is used where waiting is pointless — if another
 * transaction already holds the row, the operation is by definition a duplicate
 * and should fail fast rather than queue behind it and then fail the status
 * precondition anyway.
 */
import type { Prisma } from "@prisma/client";

export class LockContendedError extends Error {
  constructor(readonly entity: string) {
    super(`${entity} is already being processed`);
    this.name = "LockContendedError";
  }
}

async function lockRow(tx: Prisma.TransactionClient, table: string, id: string, entity: string): Promise<boolean> {
  try {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "${table}" WHERE "id" = $1::uuid FOR UPDATE NOWAIT`,
      id
    );
    return rows.length > 0;
  } catch (err) {
    // 55P03 = lock_not_available: another transaction holds this row.
    if ((err as { code?: string })?.code === "55P03" || /could not obtain lock/i.test(String(err))) {
      throw new LockContendedError(entity);
    }
    throw err;
  }
}

/** Take an exclusive lock on a loan application. Returns false if it does not exist. */
export function lockLoanApplication(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return lockRow(tx, "loan_applications", id, "Loan application");
}

/** Take an exclusive lock on a repayment. Returns false if it does not exist. */
export function lockRepayment(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return lockRow(tx, "repayments", id, "Repayment");
}

/** Take an exclusive lock on a ledger transaction. Returns false if it does not exist. */
export function lockTransaction(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return lockRow(tx, "transactions", id, "Transaction");
}

/** Postgres unique-violation. Used to detect a lost idempotency race. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; meta?: { target?: string | string[] } };
  if (e?.code !== "P2002" && e?.code !== "23505") return false;
  if (!constraint) return true;
  const target = e?.meta?.target;
  const targets = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return targets.includes(constraint) || String(err).includes(constraint);
}
