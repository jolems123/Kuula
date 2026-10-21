import type { BusinessDetails } from "../api/types";
import { expenditureError } from "../components/ExpenditureDetails";
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
  const funds = Object.values(b.useOfFunds);
  if (funds.some(value => !whole(value)) || funds.reduce((sum, value) => sum + value, 0) !== input.amount) add("loan-spending", `Allocate exactly UGX ${input.amount.toLocaleString("en-UG")} across the five categories. Put 0 in unused categories; do not repeat the full loan in each box.`);
  const detailError = expenditureError(b.expenditureItems ?? [], b.useOfFunds);
  if (detailError) add("loan-items", detailError);
  const textFields = { businessName: ["Business or trading name", 120], applicantPosition: ["Your position in the business", 80], sector: ["Business sector", 80], district: ["Business district", 80], physicalAddress: ["Business address", 200], goodsOrServices: ["Main products or services", 300], customerType: ["Main customers", 100], loanUse: ["How you will use the loan", 300], repaymentPlan: ["How your business will repay the loan", 300] } as const;
  for (const [key, [label, max]] of Object.entries(textFields)) {
    const value = String(b[key as keyof BusinessDetails] ?? "").trim();
    if (!value || value.length > max) add(`loan-${key}`, `${label}: enter 1–${max} characters.`);
  }
  if (b.tradingAs === "registered" && !b.registrationNumber.trim()) add("loan-registrationNumber", "Enter the registration number for your registered business.");
  if (!whole(b.tradingMonths, 1, 1200)) add("loan-tradingMonths", "Enter months trading as a whole number from 1 to 1,200.");
  if (!whole(b.staffCount, 0, 100000)) add("loan-staffCount", "Enter a whole number of workers; use 0 if you work alone.");
  const lat = b.latitude, lng = b.longitude;
  if ((lat == null) !== (lng == null) || (lat != null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng != null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) add("loan-location", "Set both valid business coordinates, or clear the incomplete location pin.");
  for (const [key, label] of [["exterior", "business exterior"], ["interior", "business interior"], ["applicant_at_business", "yourself at the business"]]) if (!input.photos[key]) add("loan-photos", `Attach a clear photo of ${label}.`);
  if (!input.consent) add("loan-photo-consent", "Confirm consent to securely process your business photos.");
  if (b.salesFrequency === "unknown") add("loan-salesFrequency", "Choose how often the business makes sales.");
  if (!whole(input.income, 1)) add("loan-income", "Enter your average monthly sales before costs, in whole UGX.");
  if (!whole(input.expenses)) add("loan-expenses", "Enter total monthly operating expenses in whole UGX, or 0 if none.");
  if (!whole(input.debt)) add("loan-debt", "Enter monthly payments on existing debts in whole UGX, or 0 if none.");
  const parts = [b.inventoryCost, b.rentCost, b.wagesCost, b.otherOperatingCosts];
  if (parts.some(value => !whole(value)) || parts.reduce((sum, value) => sum + value, 0) > input.expenses) add("loan-finances", "Monthly cost details must be whole non-negative amounts and cannot exceed total monthly expenses.");
  if (!whole(b.lowSeasonMonthlySales) || b.lowSeasonMonthlySales > input.income) add("loan-lowSeasonMonthlySales", "Low-season monthly sales must be a whole amount no higher than typical monthly sales.");
  if (input.expenses + input.debt >= input.income && input.income > 0) add("loan-finances", "Expenses plus existing debt payments must be below monthly sales. Check the figures; eligibility still depends on Kuula’s review.");
  return issues;
}
