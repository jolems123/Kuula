import type { BusinessDetails } from "../api/types";
export interface LoanFormIssue { target: string; message: string }
export function checkLoanForm(input: { amount: number; term: number; purposes: string[]; otherPurpose: string; business: BusinessDetails; income: number; expenses: number; debt: number; photos: Record<string, unknown>; consent: boolean; identityApproved: boolean }): LoanFormIssue[] {
  const { business: b } = input;
  const issues: LoanFormIssue[] = [];
  const add = (target: string, message: string) => issues.push({ target, message });
  const whole = (value: number, min = 0, max = 100_000_000_000) => Number.isSafeInteger(value) && value >= min && value <= max;
  if (!input.identityApproved) add("loan-identity", "Your identity documents must be verified and approved before you can apply.");
  if (!whole(input.amount, 50_000, 2_000_000)) add("loan-amount", "Enter a whole loan amount between UGX 50,000 and UGX 2,000,000.");
  if (!whole(input.term, 30, 365)) add("loan-term", "Choose a repayment term between 30 and 365 days.");
  if (!input.purposes.length) add("loan-purposes", "Select at least one business loan purpose.");
  if (input.purposes.includes("Other") && (!input.otherPurpose.trim() || input.otherPurpose.trim().length > 100)) add("loan-other-purpose", "Describe the other business purpose in 1–100 characters.");
  const textFields = { businessName: ["Business or trading name", 120], applicantPosition: ["Your position in the business", 80], sector: ["Business sector", 80], district: ["Business district", 80], physicalAddress: ["Business address", 200], goodsOrServices: ["Main products or services", 300] } as const;
  for (const [key, [label, max]] of Object.entries(textFields)) {
    const value = String(b[key as keyof BusinessDetails] ?? "").trim();
    if (!value || value.length > max) add(`loan-${key}`, `${label}: enter 1–${max} characters.`);
  }
  if (b.tradingAs === "registered" && !b.registrationNumber.trim()) add("loan-registrationNumber", "Enter the registration number for your registered business.");
  if (!whole(b.tradingMonths, 1, 1200)) add("loan-tradingMonths", "Enter months trading as a whole number from 1 to 1,200.");
  const lat = b.latitude, lng = b.longitude;
  if ((lat == null) !== (lng == null) || (lat != null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng != null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) add("loan-location", "Set both valid business coordinates, or clear the incomplete location pin.");
  for (const [key, label] of [["exterior", "business exterior"], ["interior", "business interior"], ["applicant_at_business", "yourself at the business"]]) if (!input.photos[key]) add("loan-photos", `Attach a clear photo of ${label}.`);
  if (!input.consent) add("loan-photo-consent", "Confirm consent to securely process your business photos.");
  if (!whole(input.income, 1)) add("loan-income", "Enter your average monthly sales before costs, in whole UGX.");
  if (!whole(input.expenses)) add("loan-expenses", "Enter total monthly operating expenses in whole UGX, or 0 if none.");
  if (!whole(input.debt)) add("loan-debt", "Enter monthly payments on existing debts in whole UGX, or 0 if none.");
  if (input.expenses + input.debt >= input.income && input.income > 0) add("loan-finances", "Expenses plus existing debt payments must be below monthly sales. Check the figures; eligibility still depends on Kuula’s review.");
  const guarantors = b.guarantors ?? [];
  if (guarantors.length !== 2) add("loan-guarantors", "Add two guarantor contacts: each person's name and phone number.");
  guarantors.forEach((guarantor, index) => {
    if (!guarantor.name?.trim() || guarantor.name.trim().length > 120) add(`loan-guarantor-${index + 1}-name`, `Enter guarantor ${index + 1}'s name.`);
    if (!/^((\+?256\d{9})|(0\d{9}))$/.test((guarantor.phone ?? "").replace(/[\s()-]/g, ""))) add(`loan-guarantor-${index + 1}-phone`, `Enter a valid Ugandan phone number for guarantor ${index + 1}.`);
  });
  return issues;
}
