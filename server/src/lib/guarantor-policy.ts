/** No guarantor is needed by default; any recorded unresolved requirement blocks payout. */
export function guarantorCleared(status: string | null | undefined): boolean {
  return status == null || status === "not_required" || status === "waived" || status === "verified";
}
export function canSignGuarantor(status: string, applicationStatus: string): boolean {
  return status === "required" && applicationStatus === "offered";
}
export function requiresIndependentGuarantorReview(status: string): boolean {
  return status === "signed_pending_review";
}
