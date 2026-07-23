/**
 * Uganda National Identification Number (NIN) validation (server mirror of the
 * client helper in src/app/lib/nin.ts).
 *
 * A Ugandan NIN is 14 alphanumeric characters, e.g. `CM8602410E8EWE`:
 * two leading letters (nationality + gender) followed by 12 alphanumerics.
 */
export const UGANDA_NIN_REGEX = /^[A-Z]{2}[A-Z0-9]{12}$/;

export function normalizeNin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidUgandaNin(value: string): boolean {
  return UGANDA_NIN_REGEX.test(normalizeNin(value));
}
