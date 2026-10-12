const STANDARD_PURPOSES = new Set([
  "Business: Inventory and stock",
  "Business: Equipment and tools",
  "Business: Working capital",
  "Business: Business expansion",
]);

const OTHER_PREFIX = "Business: Other - ";

export function isBusinessLoanPurpose(purpose: string): boolean {
  if (STANDARD_PURPOSES.has(purpose)) return true;
  if (!purpose.startsWith(OTHER_PREFIX)) return false;
  const detail = purpose.slice(OTHER_PREFIX.length).trim();
  return detail.length > 0 && detail.length <= 100 && purpose.slice(OTHER_PREFIX.length) === detail;
}
