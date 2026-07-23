/**
 * Uganda National Identification Number (NIN) helpers.
 *
 * A Ugandan NIN is 14 alphanumeric characters, e.g. `CM8602410E8EWE`:
 *   - char 1:    nationality letter (C = citizen)
 *   - char 2:    gender letter (M / F)
 *   - chars 3-14: alphanumeric (birth year, sequence, checksum)
 *
 * We validate the shape (two leading letters + 12 alphanumerics = 14 total)
 * rather than decoding every field, which keeps us tolerant of edge cases in
 * NIRA's issuance while still rejecting the old "10-12 digit" style input.
 */
export const UGANDA_NIN_REGEX = /^[A-Z]{2}[A-Z0-9]{12}$/;

export const UGANDA_NIN_LENGTH = 14;

/** Uppercases and strips whitespace so `cm 8602410 e8ewe` becomes `CM8602410E8EWE`. */
export function normalizeNin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** True when `value` is a validly-shaped Ugandan NIN (after normalization). */
export function isValidUgandaNin(value: string): boolean {
  return UGANDA_NIN_REGEX.test(normalizeNin(value));
}
