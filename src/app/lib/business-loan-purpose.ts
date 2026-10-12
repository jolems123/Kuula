export const BUSINESS_LOAN_PURPOSES = [
  "Inventory and stock",
  "Equipment and tools",
  "Working capital",
  "Business expansion",
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
  const detail = value.slice(prefix.length);
  if (detail.startsWith("Other - ")) {
    const otherDetails = detail.slice("Other - ".length);
    return otherDetails.trim() ? { option: "Other", otherDetails } : { option: "Other", otherDetails: "" };
  }
  const option = BUSINESS_LOAN_PURPOSES.find((purpose) => purpose !== "Other" && purpose === detail);
  return option ? { option, otherDetails: "" } : null;
}
