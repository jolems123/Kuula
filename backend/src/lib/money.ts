/**
 * Money helpers. All money is stored as BIGINT cents in the DB; the API layer
 * converts to whole UGX on the way in/out (UGX has no fractional unit so this
 * is exact). The 100x factor keeps us flexible if we ever need pesa subunits.
 */
export const UGX_PER_UNIT = 1; // UGX has no fractional unit, but stored as cents

export function toCents(ugx: number | string): number {
  const n = Math.round(Number(ugx));
  if (!Number.isFinite(n)) throw new TypeError(`invalid money value: ${ugx}`);
  return n;
}

export function fromCents(cents: number | bigint): number {
  return Number(cents);
}

/** Format UGX with thousands separators: 1500000 -> "1,500,000". */
export function formatUgx(cents: number | bigint): string {
  return fromCents(cents).toLocaleString("en-US");
}
