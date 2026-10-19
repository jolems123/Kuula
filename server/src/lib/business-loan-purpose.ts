const STANDARD_PURPOSES = new Set([
  "Business: Stock and inventory",
  "Business: Raw materials and supplies",
  "Business: Equipment, tools and machinery",
  "Business: Agriculture and livestock",
  "Business: Transport and delivery",
  "Business: Business premises and improvements",
  "Business: Business operating expenses",
  "Business: Marketing and sales",
  "Business: Technology and digital tools",
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
