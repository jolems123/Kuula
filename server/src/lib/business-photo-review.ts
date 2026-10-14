import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";

const requiredTypes = ["exterior", "interior", "applicant_at_business"] as const;

/** All three distinct, privately stored customer photographs must exist.
 * Upload alone does NOT prove authenticity. A separate staff verification is mandatory.
 */
export async function assertBusinessPhotoEvidence(applicationId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ photo_type: string; photo_count: bigint }[]>(Prisma.sql`
    SELECT photo_type, COUNT(*) AS photo_count
    FROM business_application_photos
    WHERE application_id = ${applicationId}::uuid
    GROUP BY photo_type
  `);
  const types = new Set(rows.filter(row => Number(row.photo_count) === 1).map(row => row.photo_type));
  if (!requiredTypes.every(type => types.has(type)))
    throw new AppError("Business exterior, interior and applicant-at-business photographs must be uploaded before verification or approval", 422);
}
