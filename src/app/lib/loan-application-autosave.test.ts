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

describe("loan application autosave", () => {
  it("restores the saved draft only for the matching user", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
    saveLoanApplicationDraft("customer-1", draft);

    expect(getSavedLoanApplicationDraft("customer-1")).toEqual(draft);
    expect(getSavedLoanApplicationDraft("customer-2")).toBeNull();
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
