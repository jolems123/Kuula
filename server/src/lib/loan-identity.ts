import { AppError } from "../middleware/error-handler.js";

export async function assertLoanIdentityApproved(
  user: { phoneVerified: boolean; kycVerified: boolean },
  latestSubmission: () => Promise<{ status: string } | null>,
): Promise<void> {
  if (!user.phoneVerified) throw new AppError("Verify your phone before applying for a loan", 403);
  if (!user.kycVerified || (await latestSubmission())?.status !== "verified") {
    throw new AppError("Your identity documents must be verified and approved before you can apply for a loan. Open Identity Verification to check their status.", 403);
  }
}
