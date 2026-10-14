/** Business declarations are a credit-review snapshot, NOT verified financial statements. */
export interface BusinessProfile {
  businessName: string;
  applicantPosition: string;
  locationSource: "gps" | "manual" | "none";
  locationCapturedAt: string | null;
  locationAccuracyMeters: number | null;
  sector: string;
  tradingAs: "registered" | "informal";
  registrationNumber: string;
  tradingMonths: number;
  district: string;
  physicalAddress: string;
  latitude: number | null;
  longitude: number | null;
  goodsOrServices: string;
  customerType: string;
  primarySuppliers: string;
  supplierPaymentTerms: string;
  salesFrequency: "daily" | "weekly" | "monthly" | "seasonal" | "unknown";
  seasonalPattern: string;
  lowSeasonMonthlySales: number;
  inventoryCost: number;
  rentCost: number;
  wagesCost: number;
  otherOperatingCosts: number;
  otherDebtDetails: string;
  staffCount: number;
  monthlySales: number;
  monthlyBusinessExpenses: number;
  monthlyExistingDebt: number;
  preferredRepaymentFrequency: "daily" | "weekly" | "biweekly" | "monthly" | "at_maturity";
  useOfFunds: {
    stock: number;
    equipment: number;
    operations: number;
    expansion: number;
    other: number;
  };
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
function coordinate(value: unknown, label: string, min: number, max: number): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(label + " must be a valid map coordinate");
  }
  return value;
}
export function parseBusinessProfile(raw: unknown): BusinessProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RangeError("Business information is required");
  const obj = raw as Record<string, unknown>;
  const businessName = required(obj.businessName, "Business name", 120);
  const tradingAs = obj.tradingAs;
  if (tradingAs !== "registered" && tradingAs !== "informal") throw new RangeError("Select whether the business is registered");
  const registrationNumber = optional(obj.registrationNumber, "Registration number");
  if (tradingAs === "registered" && !registrationNumber) throw new RangeError("Enter the business registration number");
  const latitude = coordinate(obj.latitude, "Latitude", -90, 90);
  const longitude = coordinate(obj.longitude, "Longitude", -180, 180);
  if ((latitude === null) !== (longitude === null)) throw new RangeError("Both business location coordinates are required");
  const locationSource = obj.locationSource == null ? "none" : obj.locationSource;
  if (!["gps", "manual", "none"].includes(String(locationSource))) throw new RangeError("Business location source is invalid");
  const locationCapturedAt = obj.locationCapturedAt == null ? null : String(obj.locationCapturedAt);
  if (locationCapturedAt !== null && (!Number.isFinite(Date.parse(locationCapturedAt)) || new Date(locationCapturedAt) > new Date())) throw new RangeError("Business location capture time is invalid");
  const locationAccuracyMeters = obj.locationAccuracyMeters == null ? null : Number(obj.locationAccuracyMeters);
  if (locationAccuracyMeters !== null && (!Number.isFinite(locationAccuracyMeters) || locationAccuracyMeters < 0 || locationAccuracyMeters > 100_000)) throw new RangeError("Business location accuracy is invalid");
  if (locationSource !== "none" && (latitude === null || longitude === null)) throw new RangeError("Pinned business coordinates are required");
  const profile: BusinessProfile = {
    businessName,
    applicantPosition: optional(obj.applicantPosition, "Applicant role in business", 80),
    locationSource: locationSource as BusinessProfile["locationSource"],
    locationCapturedAt,
    locationAccuracyMeters,
    sector: required(obj.sector, "Business sector", 80),
    tradingAs,
    registrationNumber,
    tradingMonths: numeric(obj.tradingMonths, "Months trading", 1, 1200),
    district: required(obj.district, "Business district", 80),
    physicalAddress: required(obj.physicalAddress, "Business location", 200),
    latitude,
    longitude,
    goodsOrServices: required(obj.goodsOrServices, "Products or services", 300),
    customerType: required(obj.customerType, "Main customers", 100),
    primarySuppliers: optional(obj.primarySuppliers, "Main suppliers", 200),
    supplierPaymentTerms: optional(obj.supplierPaymentTerms, "Supplier payment arrangements", 100),
    salesFrequency: (obj.salesFrequency ?? "unknown") as BusinessProfile["salesFrequency"],
    seasonalPattern: optional(obj.seasonalPattern, "Seasonality", 200),
    lowSeasonMonthlySales: numeric(obj.lowSeasonMonthlySales ?? 0, "Low-season monthly sales", 0, 100000000000),
    inventoryCost: numeric(obj.inventoryCost ?? 0, "Monthly inventory costs", 0, 100000000000),
    rentCost: numeric(obj.rentCost ?? 0, "Monthly rent", 0, 100000000000),
    wagesCost: numeric(obj.wagesCost ?? 0, "Monthly wages", 0, 100000000000),
    otherOperatingCosts: numeric(obj.otherOperatingCosts ?? 0, "Other operating expenses", 0, 100000000000),
    otherDebtDetails: optional(obj.otherDebtDetails, "Existing debt details", 200),
    staffCount: numeric(obj.staffCount, "Number of workers", 0, 100000),
    monthlySales: numeric(obj.monthlySales, "Monthly business sales", 1, 100000000000),
    monthlyBusinessExpenses: numeric(obj.monthlyBusinessExpenses, "Monthly business expenses", 0, 100000000000),
    monthlyExistingDebt: numeric(obj.monthlyExistingDebt, "Monthly existing debt payments", 0, 100000000000),
    preferredRepaymentFrequency: (obj.preferredRepaymentFrequency ?? "at_maturity") as BusinessProfile["preferredRepaymentFrequency"],
    useOfFunds: {
      stock: numeric((obj.useOfFunds as Record<string, unknown> | null)?.stock ?? 0, "Funds for stock", 0, 100000000000),
      equipment: numeric((obj.useOfFunds as Record<string, unknown> | null)?.equipment ?? 0, "Funds for equipment", 0, 100000000000),
      operations: numeric((obj.useOfFunds as Record<string, unknown> | null)?.operations ?? 0, "Funds for operations", 0, 100000000000),
      expansion: numeric((obj.useOfFunds as Record<string, unknown> | null)?.expansion ?? 0, "Funds for expansion", 0, 100000000000),
      other: numeric((obj.useOfFunds as Record<string, unknown> | null)?.other ?? 0, "Funds for other uses", 0, 100000000000),
    },
    loanUse: required(obj.loanUse, "How the loan will be used", 300),
    repaymentPlan: required(obj.repaymentPlan, "How the business will repay", 300),
  };
  if (!["daily", "weekly", "monthly", "seasonal", "unknown"].includes(profile.salesFrequency))
    throw new RangeError("Select a valid sales frequency");
  if (!["daily", "weekly", "biweekly", "monthly", "at_maturity"].includes(profile.preferredRepaymentFrequency)) throw new RangeError("Invalid preferred repayment frequency");
  const expenseParts = profile.inventoryCost + profile.rentCost + profile.wagesCost + profile.otherOperatingCosts;
  if (!Number.isSafeInteger(expenseParts) || expenseParts > profile.monthlyBusinessExpenses)
    throw new RangeError("Expense breakdown exceeds declared business expenses");
  if (profile.lowSeasonMonthlySales > profile.monthlySales)
    throw new RangeError("Low-season monthly sales cannot exceed typical monthly sales");
  if (profile.monthlySales <= profile.monthlyBusinessExpenses + profile.monthlyExistingDebt)
    throw new RangeError("Business expenses and existing debt exceed the declared monthly sales");
  return profile;
}
