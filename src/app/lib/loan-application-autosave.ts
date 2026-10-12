import { BUSINESS_LOAN_PURPOSES, type BusinessLoanPurposeOption } from "./business-loan-purpose";

const STORAGE_PREFIX = "kuula:loan-application-draft:v1:";
const METHODS = ["MTN MoMo", "Airtel Money"];
const EMPLOYMENT = ["Employed", "Self-employed", "Business owner", "Other"];
const WORK_DURATIONS = ["Less than 6 months", "6–12 months", "1–2 years", "2+ years"];
const INCOME_SOURCES = ["Business sales", "Service income", "Salary", "Commission", "Other"];

export interface LoanApplicationFormDraft {
  amount: number;
  termDays: number;
  purpose: BusinessLoanPurposeOption;
  otherPurpose: string;
  method: string;
  employmentStatus: string;
  occupationOrBusiness: string;
  employerOrBusinessName: string;
  workDuration: string;
  incomeSource: string;
  repaymentSource: string;
  income: number;
  expenses: number;
  existingDebt: number;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function storageAvailable(): boolean {
  return typeof window !== "undefined";
}

function isString(value: unknown, maxLength = 120): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isAmount(value: unknown, max = 1_000_000_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function isDraft(value: unknown): value is LoanApplicationFormDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return isAmount(draft.amount, 2_000_000)
    && isAmount(draft.termDays, 365)
    && BUSINESS_LOAN_PURPOSES.some((purpose) => purpose === draft.purpose)
    && isString(draft.otherPurpose, 100)
    && METHODS.includes(String(draft.method))
    && (draft.employmentStatus === "" || EMPLOYMENT.includes(String(draft.employmentStatus)))
    && isString(draft.occupationOrBusiness)
    && isString(draft.employerOrBusinessName)
    && (draft.workDuration === "" || WORK_DURATIONS.includes(String(draft.workDuration)))
    && (draft.incomeSource === "" || INCOME_SOURCES.includes(String(draft.incomeSource)))
    && isString(draft.repaymentSource)
    && isAmount(draft.income)
    && isAmount(draft.expenses)
    && isAmount(draft.existingDebt);
}

export function getSavedLoanApplicationDraft(userId: string): LoanApplicationFormDraft | null {
  if (!storageAvailable() || !userId) return null;
  const key = storageKey(userId);
  let serialized: string | null;
  try {
    serialized = window.sessionStorage.getItem(key);
  } catch (error) {
    console.warn("Could not read the saved loan application draft from this browser tab.", error);
    return null;
  }
  if (serialized === null) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isDraft(parsed)) return parsed;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  console.warn("Discarding an invalid saved loan application draft.");
  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn("Could not remove the invalid saved loan application draft.", error);
  }
  return null;
}

export function saveLoanApplicationDraft(userId: string, draft: LoanApplicationFormDraft): void {
  if (!storageAvailable() || !userId) return;
  window.sessionStorage.setItem(storageKey(userId), JSON.stringify(draft));
}

export function clearSavedLoanApplicationDraft(userId: string): void {
  if (!storageAvailable() || !userId) return;
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch (error) {
    console.warn("Could not clear the saved loan application draft from this browser tab.", error);
  }
}

export function clearAllSavedLoanApplicationDrafts(): void {
  if (!storageAvailable()) return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Could not clear saved loan application drafts from this browser tab.", error);
  }
}
