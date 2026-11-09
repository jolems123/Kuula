import { createHash } from "node:crypto";
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
/**
 * Fingerprint of a signed guarantee. Postgres JSONB reorders object keys, so the hash is
 * taken over a key-sorted form: the stored snapshot then re-hashes to the signed value.
 */
export function guaranteeSignatureHash(snapshot: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}
