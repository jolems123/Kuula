// Read-only audit for a dedicated non-production PostgreSQL test database.
// Does not create accounts, disburse funds, or change rows.
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "test" || process.env.ISOLATED_APPROVAL_TEST !== "YES") {
  throw new Error("Run only with NODE_ENV=test and ISOLATED_APPROVAL_TEST=YES");
}
if (!process.env.DATABASE_URL) throw new Error("Provide the isolated DATABASE_URL");
const name = new URL(process.env.DATABASE_URL).pathname.toLowerCase();
if (!/(test|isolated|sandbox|ci)/.test(name)) throw new Error("Refusing non-test database");
const prisma = new PrismaClient();
try {
  const invalidCurrent = await prisma.$queryRaw`
    SELECT c.application_id FROM credit_cases c
    LEFT JOIN approval_assignments a
      ON a.application_id=c.application_id AND a.level=c.current_level
      AND a.assignee_id=c.current_assignee_id AND a.status='active'
    WHERE c.status NOT IN ('rejected','completed','ready_for_offer')
      AND a.id IS NULL
    LIMIT 10
  `;
  const multipleActive = await prisma.$queryRaw`
    SELECT application_id, level, COUNT(*)::integer AS count
    FROM approval_assignments WHERE status='active'
    GROUP BY application_id, level HAVING COUNT(*) > 1 LIMIT 10
  `;
  const crossLevel = await prisma.$queryRaw`
    SELECT application_id, assignee_id, COUNT(DISTINCT level)::integer AS levels
    FROM approval_assignments
    GROUP BY application_id, assignee_id
    HAVING COUNT(DISTINCT level) > 1 LIMIT 10
  `;
  const missingFinal = await prisma.$queryRaw`
    SELECT c.application_id FROM credit_cases c
    WHERE c.status='ready_for_offer'
      AND NOT EXISTS (
        SELECT 1 FROM approval_actions a
        WHERE a.application_id=c.application_id AND a.level=3 AND a.action='approve'
      ) LIMIT 10
  `;
  const counts = {
    invalidCurrent: invalidCurrent.length,
    multipleActive: multipleActive.length,
    crossLevel: crossLevel.length,
    missingFinal: missingFinal.length,
  };
  const passed = Object.values(counts).every((count) => count === 0);
  process.stdout.write(JSON.stringify({ test: "credit-approval-integrity", passed, counts }) + "\n");
  if (!passed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
