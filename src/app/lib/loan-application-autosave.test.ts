import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAllSavedLoanApplicationDrafts,
  clearSavedLoanApplicationDraft,
  getSavedLoanApplicationDraft,
  saveLoanApplicationDraft,
  type LoanApplicationFormDraft,
} from "./loan-application-autosave";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const draft: LoanApplicationFormDraft = {
  amount: 500_000,
  termDays: 90,
  purpose: "Other",
  otherPurpose: "Buy a second oven",
  method: "MTN MoMo",
  employmentStatus: "Business owner",
  occupationOrBusiness: "Bakery",
  employerOrBusinessName: "Kato Bakery",
  workDuration: "2+ years",
  incomeSource: "Business sales",
  repaymentSource: "Bakery sales",
  income: 1_000_000,
  expenses: 300_000,
  existingDebt: 100_000,
};

afterEach(() => vi.unstubAllGlobals());

it("preserves all chosen purposes and rejects duplicate or unknown selections", () => {
  const sessionStorage = new MemoryStorage();
  vi.stubGlobal("window", { sessionStorage });
  const purposes = ["Working capital", "Stock and inventory", "Other"] as const;
  saveLoanApplicationDraft("multi", { ...draft, purposes: [...purposes] });
  expect(getSavedLoanApplicationDraft("multi")?.purposes).toEqual(purposes);
  for (const invalid of [["Personal"], ["Working capital", "Working capital"]]) {
    sessionStorage.setItem("kuula:loan-application-draft:v1:multi", JSON.stringify({ ...draft, purposes: invalid }));
    expect(getSavedLoanApplicationDraft("multi")).toBeNull();
  }
});

it("restores previous loan purpose names without losing a saved application", () => {
  const sessionStorage = new MemoryStorage();
  vi.stubGlobal("window", { sessionStorage });
  sessionStorage.setItem("kuula:loan-application-draft:v1:legacy-user", JSON.stringify({ ...draft, purpose: "Inventory and stock" }));
  expect(getSavedLoanApplicationDraft("legacy-user")?.purpose).toBe("Stock and inventory");
  expect(getSavedLoanApplicationDraft("legacy-user")?.amount).toBe(draft.amount);
});

describe("loan application autosave", () => {
  it("restores the saved draft only for the matching user", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    saveLoanApplicationDraft("customer-1", draft);

    expect(getSavedLoanApplicationDraft("customer-1")).toEqual(draft);
    expect(getSavedLoanApplicationDraft("customer-2")).toBeNull();
  });

  it("preserves a pinned GPS location in the saved draft", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    const locatedDraft = {
      ...draft,
      businessDetails: {
        businessName: "Kato Bakery",
        applicantPosition: "Owner",
        locationSource: "gps" as const,
        locationCapturedAt: "2026-10-14T11:00:00.000Z",
        locationAccuracyMeters: 15,
        sector: "Food and hospitality",
        tradingAs: "informal" as const,
        registrationNumber: "",
        tradingMonths: 30,
        district: "Wakiso",
        physicalAddress: "Kitemu trading centre",
        latitude: 0.3476,
        longitude: 32.5825,
        goodsOrServices: "Bakery",
        customerType: "Walk-in customers",
        primarySuppliers: "Wholesale market", supplierPaymentTerms: "Cash", salesFrequency: "daily" as const, seasonalPattern: "", lowSeasonMonthlySales: 0,
        inventoryCost: 300000, rentCost: 50000, wagesCost: 50000, otherOperatingCosts: 50000, otherDebtDetails: "",
        staffCount: 2,
        preferredRepaymentFrequency: "monthly" as const,
        useOfFunds: { stock: 50000, equipment: 100000, operations: 0, expansion: 0, other: 0 },
        loanUse: "Buy a second oven",
        repaymentPlan: "Bakery sales",
      },
    };

    saveLoanApplicationDraft("customer-1", locatedDraft);

    expect(getSavedLoanApplicationDraft("customer-1")?.businessDetails).toEqual(locatedDraft.businessDetails);
  });

  it("clears the saved draft after submission", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    saveLoanApplicationDraft("customer-1", draft);

    clearSavedLoanApplicationDraft("customer-1");

    expect(getSavedLoanApplicationDraft("customer-1")).toBeNull();
  });

  it("clears all saved drafts on logout", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    saveLoanApplicationDraft("customer-1", draft);
    saveLoanApplicationDraft("customer-2", draft);

    clearAllSavedLoanApplicationDrafts();

    expect(getSavedLoanApplicationDraft("customer-1")).toBeNull();
    expect(getSavedLoanApplicationDraft("customer-2")).toBeNull();
  });
});
