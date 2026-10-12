/** Business declarations are a credit-review snapshot, NOT verified financial statements. */
export interface BusinessProfile {
  businessName: string;
  sector: string;
  tradingAs: "registered" | "informal";
  registrationNumber: string;
  tradingMonths: number;
  district: string;
  physicalAddress: string;
  goodsOrServices: string;
  customerType: string;
  staffCount: number;
  monthlySales: number;
  monthlyBusinessExpenses: number;
  monthlyExistingDebt: number;
  loanUse: string;
  repaymentPlan: string;
}
function required(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new RangeError(label + " is required (maximum " + max + " characters)");
  }
  return value.trim();
}
function optional(value: unknown, label: string, max = 100): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) throw new RangeError(label + " is invalid");
  return value.trim();
}
function numeric(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(label + " must be a whole number between " + min + " and " + max);
  }
  return value;
}
export function parseBusinessProfile(raw: unknown): BusinessProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RangeError("Business information is required");
  const obj = raw as Record<string, unknown>;
  const tradingAs = obj.tradingAs;
  if (tradingAs !== "registered" && tradingAs !== "informal") throw new RangeError("Select whether the business is registered");
  const registrationNumber = optional(obj.registrationNumber, "Registration number");
  if (tradingAs === "registered" && !registrationNumber) throw new RangeError("Enter the business registration number");
  const profile: BusinessProfile = {
    businessName: required(obj.businessName, "Business name", 120),
    sector: required(obj.sector, "Business sector", 80),
    tradingAs,
    registrationNumber,
    tradingMonths: numeric(obj.tradingMonths, "Months trading", 1, 1200),
    district: required(obj.district, "Business district", 80),
    physicalAddress: required(obj.physicalAddress, "Business location", 200),
    goodsOrServices: required(obj.goodsOrServices, "Products or services", 300),
    customerType: required(obj.customerType, "Main customers", 100),
    staffCount: numeric(obj.staffCount, "Number of workers", 0, 100000),
    monthlySales: numeric(obj.monthlySales, "Monthly business sales", 1, 100000000000),
    monthlyBusinessExpenses: numeric(obj.monthlyBusinessExpenses, "Monthly business expenses", 0, 100000000000),
    monthlyExistingDebt: numeric(obj.monthlyExistingDebt, "Monthly existing debt payments", 0, 100000000000),
    loanUse: required(obj.loanUse, "How the loan will be used", 300),
    repaymentPlan: required(obj.repaymentPlan, "How the business will repay", 300),
  };
  if (profile.monthlySales <= profile.monthlyBusinessExpenses + profile.monthlyExistingDebt)
    throw new RangeError("Business expenses and existing debt exceed the declared monthly sales");
  return profile;
}
