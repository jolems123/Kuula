import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";

export async function writeAuditEvent(input: {
  actorId?: string | null;
  subjectUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ? input.metadata as Prisma.InputJsonValue : undefined,
    },
  });
}
