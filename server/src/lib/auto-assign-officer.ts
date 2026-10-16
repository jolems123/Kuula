import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

/** Select an eligible Level 1 officer at random among the least-loaded officers.
 * This function must be called within the loan application's database transaction.
 */
export async function assignInitialLoanOfficer(tx: Prisma.TransactionClient, applicationId: string, customerId: string): Promise<string | null> {
  // Serialize allocation to prevent simultaneous submissions flooding the same officer.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(65127124)`);
  const officers = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    SELECT u.id
    FROM users u
    LEFT JOIN approval_assignments aa ON aa.assignee_id=u.id AND aa.status='active'
    WHERE u.role IN ('loan_officer','officer')
      AND u.deleted_at IS NULL AND u.id <> ${customerId}::uuid
    GROUP BY u.id
    ORDER BY COUNT(aa.id) ASC, random()
    LIMIT 1
  `);
  const officerId=officers[0]?.id;
  if (!officerId) return null; // leave the submitted application available for supervisor allocation
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO credit_cases (application_id, customer_id, current_level, status, current_assignee_id)
    VALUES (${applicationId}::uuid, ${customerId}::uuid, 1, 'field_evaluation', ${officerId}::uuid)
    ON CONFLICT (application_id) DO NOTHING
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO approval_assignments (id, application_id, level, assignee_id, assigned_by)
    VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, 1, ${officerId}::uuid, NULL)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO credit_operation_events (id, application_id, actor_id, event_type, to_level, detail)
    VALUES (${crypto.randomUUID()}::uuid, ${applicationId}::uuid, NULL, 'application.auto_assigned', 1,
      ${JSON.stringify({method:"randomized_least_loaded",systemInitiated:true})}::jsonb)
  `);
  return officerId;
}
