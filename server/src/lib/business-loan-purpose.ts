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
  if (typeof purpose !== "string" || purpose.length > 700 || !purpose.startsWith("Business: ")) return false;
  const parts = purpose.slice(10).split("; ");
  const seen = new Set<string>();
  while (parts.length) {
    let part = parts.shift()!;
    if (part.startsWith("Other - ")) {
      part += parts.length ? "; " + parts.join("; ") : "";
      parts.length = 0;
      const detail = part.slice(8);
      if (!detail.trim() || detail !== detail.trim() || detail.length > 100) return false;
      part = "Other";
    } else if (!STANDARD_PURPOSES.has("Business: " + part)) return false;
    const normalized = part === "Inventory and stock" ? "Stock and inventory" : part === "Equipment and tools" ? "Equipment, tools and machinery" : part;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
  }
  return seen.size > 0 && seen.size <= 12;
}
