export const BUSINESS_LOAN_PURPOSES = [
  "Stock and inventory",
  "Raw materials and supplies",
  "Equipment, tools and machinery",
  "Working capital",
  "Business expansion",
  "Agriculture and livestock",
  "Transport and delivery",
  "Business premises and improvements",
  "Business operating expenses",
  "Marketing and sales",
  "Technology and digital tools",
  "Other",
] as const;

export type BusinessLoanPurposeOption = (typeof BUSINESS_LOAN_PURPOSES)[number];

export function formatBusinessLoanPurpose(option: BusinessLoanPurposeOption, otherDetails = ""): string {
  return option === "Other"
    ? `Business: Other - ${otherDetails.trim()}`
    : `Business: ${option}`;
}

export function parseBusinessLoanPurpose(value: string): { option: BusinessLoanPurposeOption; otherDetails: string } | null {
  const prefix = "Business: ";
  if (!value.startsWith(prefix)) return null;
  const legacy: Record<string, string> = { "Inventory and stock": "Stock and inventory", "Equipment and tools": "Equipment, tools and machinery" };
  const original = value.slice(prefix.length);
  const detail = legacy[original] ?? original;
  if (detail.startsWith("Other - ")) {
    const otherDetails = detail.slice("Other - ".length);
    return otherDetails.trim() ? { option: "Other", otherDetails } : { option: "Other", otherDetails: "" };
  }
  const option = BUSINESS_LOAN_PURPOSES.find((purpose) => purpose !== "Other" && purpose === detail);
  return option ? { option, otherDetails: "" } : null;
}
