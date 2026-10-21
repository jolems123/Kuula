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

export function formatBusinessLoanPurposes(options: BusinessLoanPurposeOption[], otherDetails = ""): string {
  return "Business: " + [...new Set(options)].map(option => option === "Other" ? `Other - ${otherDetails.trim()}` : option).sort((a, b) => Number(a.startsWith("Other - ")) - Number(b.startsWith("Other - "))).join("; ");
}

export function parseBusinessLoanPurposes(value: string): { options: BusinessLoanPurposeOption[]; otherDetails: string } | null {
  if (!value.startsWith("Business: ")) return null;
  const parts = value.slice(10).split("; ");
  const options: BusinessLoanPurposeOption[] = [];
  let otherDetails = "";
  while (parts.length) {
    let part = parts.shift()!;
    if (part.startsWith("Other - ")) { part += parts.length ? "; " + parts.join("; ") : ""; parts.length = 0; }
    const parsed = parseBusinessLoanPurpose("Business: " + part);
    if (!parsed || options.includes(parsed.option)) return null;
    options.push(parsed.option);
    if (parsed.option === "Other") otherDetails = parsed.otherDetails;
  }
  return options.length ? { options, otherDetails } : null;
}

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
