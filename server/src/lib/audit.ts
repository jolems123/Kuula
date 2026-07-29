import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "./prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append an immutable audit record.
 *
 * Never throws: an audit write failing must not roll back or block the money
 * movement it is describing. Pass the transaction client when the audit entry
 * should be atomic with the change it records.
 */
export async function audit(input: AuditInput, db: Db = prisma): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record event", input.action, input.entityId, err);
  }
}
