import { computeCreditScore } from "./credit-score.js";
import type { EffectiveCreditEvidence } from "./credit-evidence.js";

export interface UnderwritingInput {
  requestedAmount: number;
  totalRepayment: number;
  termDays: number;
  declaredMonthlyIncome: number;
  declaredMonthlyExpenses: number;
  existingDebtPayment: number;
  verifiedMonthlyIncome?: number | null;
  phoneVerified: boolean;
  kycVerified: boolean;
  evidence: EffectiveCreditEvidence;
  loansRepaid: number;
  loansTotal: number;
}

export interface UnderwritingResult {
  approved: boolean;
  status: "eligible" | "ineligible";
  creditScore: number;
  approvedLimit: number;
  disposableIncome: number;
  maxAffordablePayment: number;
  flags: string[];
}

const MAX_DEBT_SERVICE_RATIO = 0.35;
const MIN_MONTHLY_INCOME_UGX = 100_000;
// Self-declared income is useful as an application signal, but it is not
// trusted at face value for affordability. Until a verified-income provider is
// available Kuula uses only 60% of the declaration for debt-capacity math.
const UNVERIFIED_INCOME_HAIRCUT = 0.60;

function integerMoney(value: number, label: string, allowZero = false): number {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0 || (!allowZero && normalized === 0)) {
    throw new RangeError(`${label} must be a valid ${allowZero ? "non-negative" : "positive"} amount`);
  }
  return normalized;
}

function scoreLimit(score: number): number {
  if (score >= 750) return 2_000_000;
  if (score >= 700) return 1_000_000;
  if (score >= 600) return 500_000;
  if (score >= 500) return 200_000;
  return 0;
}

export function evaluateUnderwriting(input: UnderwritingInput): UnderwritingResult {
  const requestedAmount = integerMoney(input.requestedAmount, "Loan amount");
  const totalRepayment = integerMoney(input.totalRepayment, "Total repayment");
  const declaredMonthlyIncome = integerMoney(input.declaredMonthlyIncome, "Monthly income");
  const declaredMonthlyExpenses = integerMoney(input.declaredMonthlyExpenses, "Monthly expenses", true);
  const existingDebtPayment = integerMoney(input.existingDebtPayment, "Existing debt payment", true);
  const verifiedMonthlyIncome = input.verifiedMonthlyIncome == null
    ? null
    : integerMoney(input.verifiedMonthlyIncome, "Verified monthly income");

  const incomeForAffordability = verifiedMonthlyIncome == null
    ? Math.floor(declaredMonthlyIncome * UNVERIFIED_INCOME_HAIRCUT)
    : Math.min(declaredMonthlyIncome, verifiedMonthlyIncome);
  const disposableIncome = Math.max(0, incomeForAffordability - declaredMonthlyExpenses - existingDebtPayment);
  const termMonths = Math.max(1, input.termDays / 30);
  const maxMonthlyDebtService = Math.max(0, Math.floor(incomeForAffordability * MAX_DEBT_SERVICE_RATIO) - existingDebtPayment);
  const maxAffordablePayment = Math.max(0, Math.floor(maxMonthlyDebtService * termMonths));

  const credit = computeCreditScore({
    momoMonths: input.evidence.momoMonths,
    momoTxnCount: input.evidence.momoTxnCount,
    crbStatus: input.evidence.crbStatus,
    kycVerified: input.kycVerified,
    loansRepaid: input.loansRepaid,
    loansTotal: input.loansTotal,
  });

  const flags: string[] = [];
  if (!input.phoneVerified) flags.push("phone_not_verified");
  if (!input.kycVerified) flags.push("kyc_not_verified");
  if (!input.evidence.momoVerified) flags.push("mobile_money_evidence_missing_or_expired");
  if (!input.evidence.crbVerified) flags.push("crb_evidence_missing_or_expired");
  if (declaredMonthlyIncome < MIN_MONTHLY_INCOME_UGX) flags.push("income_below_minimum");
  if (disposableIncome <= 0) flags.push("no_disposable_income");
  if (totalRepayment > maxAffordablePayment) flags.push("repayment_not_affordable");

  const scoreBasedLimit = scoreLimit(credit.score);
  const affordabilityPrincipalLimit = totalRepayment > 0
    ? Math.floor(requestedAmount * Math.min(1, maxAffordablePayment / totalRepayment))
    : 0;
  const approvedLimit = Math.max(0, Math.min(scoreBasedLimit, affordabilityPrincipalLimit));
  if (requestedAmount > approvedLimit) flags.push("requested_amount_above_limit");

  return {
    approved: flags.length === 0,
    status: flags.length === 0 ? "eligible" : "ineligible",
    creditScore: credit.score,
    approvedLimit,
    disposableIncome,
    maxAffordablePayment,
    flags,
  };
}

export const UNDERWRITING_POLICY = {
  maxDebtServiceRatio: MAX_DEBT_SERVICE_RATIO,
  minMonthlyIncomeUgx: MIN_MONTHLY_INCOME_UGX,
  unverifiedIncomeHaircut: UNVERIFIED_INCOME_HAIRCUT,
  offerValidityHours: 48,
} as const;
