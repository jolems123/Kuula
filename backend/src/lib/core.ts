/**
 * Kuula domain core — ported to TypeScript from the original server/core.mjs.
 *
 * Pure, dependency-free functions so they're trivially testable. Compliance
 * constants are centralised here:
 *
 *  - MAX_APR (33.6%) is the all-in effective rate ceiling. Kept BELOW Apple's
 *    hard 36% APR cap for loan apps; pricing asserts against it.
 *  - MIN_TERM_DAYS (90) keeps every loan well above Google Play's rule that
 *    bans personal-loan apps requiring full repayment in 60 days or less.
 *  - Interest is SIMPLE (never compounded): cost = principal × dailyRate × days.
 */
import { config } from "../config.js";
import { randomBytes } from "node:crypto";

export const COMPLIANCE = {
  MAX_APR: config.compliance.maxApr,
  APPLE_APR_CAP: config.compliance.appleCap,
  GOOGLE_MIN_TERM_DAYS: config.compliance.googleMinTermDays,
  MIN_TERM_DAYS: config.compliance.minTermDays,
  SAVINGS_DISCOUNT: config.compliance.savingsDiscount,
  SAVINGS_THRESHOLD: config.compliance.savingsThreshold,
  SAVINGS_APR: config.compliance.savingsApr,
} as const;

const round = Math.round;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface PricingInput {
  principal: number;
  termDays: number;
  savingsBalance?: number;
}

export interface PricingResult {
  principal: number;
  termDays: number;
  apr: number;
  aprPercent: number;
  monthlyRatePercent: number;
  interest: number;
  fee: number;
  total: number;
  savingsDiscountApplied: boolean;
  compound: boolean;
}

/** Price a loan with simple interest; APR capped at MAX_APR (and below Apple's 36%). */
export function priceLoan({ principal, termDays, savingsBalance = 0 }: PricingInput): PricingResult {
  const term = Math.max(COMPLIANCE.MIN_TERM_DAYS, Math.round(termDays || COMPLIANCE.MIN_TERM_DAYS));
  const discount = savingsBalance >= COMPLIANCE.SAVINGS_THRESHOLD ? COMPLIANCE.SAVINGS_DISCOUNT : 0;
  const apr = clamp(COMPLIANCE.MAX_APR - discount, 0, COMPLIANCE.MAX_APR);

  const dailyRate = apr / 365;
  const interest = round(principal * dailyRate * term);
  const total = principal + interest;

  const allInApr = (interest / principal) * (365 / term);
  if (allInApr > COMPLIANCE.APPLE_APR_CAP + 1e-9) {
    throw new Error(`Pricing exceeds APR cap: ${(allInApr * 100).toFixed(1)}%`);
  }

  return {
    principal,
    termDays: term,
    apr: Number(apr.toFixed(4)),
    aprPercent: Number((apr * 100).toFixed(1)),
    monthlyRatePercent: Number(((apr / 12) * 100).toFixed(2)),
    interest,
    fee: 0,
    total,
    savingsDiscountApplied: discount > 0,
    compound: false,
  };
}

export interface CreditScoreInput {
  momoMonths?: number;
  momoTxnCount?: number;
  crbStatus?: "clean" | "thin" | "adverse" | "unknown";
  savingsBalance?: number;
  kycVerified?: boolean;
  loansRepaid?: number;
  loansTotal?: number;
}

export interface CreditFactor {
  key: string;
  label: string;
  detail: string;
  weightPercent: number;
  contribution: number;
  ratingPercent: number;
}

export interface CreditScoreResult {
  score: number;
  maxScore: number;
  tier: string;
  percentile: number;
  factors: CreditFactor[];
}

/** Weighted 300–850 score from the five advertised data sources. */
export function computeCreditScore(d: CreditScoreInput): CreditScoreResult {
  const factors: Array<{ key: string; label: string; weight: number; value: number; detail: string }> = [
    {
      key: "momo", label: "Mobile Money History", weight: 0.25,
      value: (clamp((d.momoMonths ?? 0) / 12, 0, 1) + clamp((d.momoTxnCount ?? 0) / 100, 0, 1)) / 2,
      detail: `${d.momoMonths ?? 0} months · ${d.momoTxnCount ?? 0} transactions`,
    },
    {
      key: "crb", label: "Credit Reference Bureau", weight: 0.15,
      value: d.crbStatus === "clean" ? 1 : d.crbStatus === "thin" ? 0.6 : 0.25,
      detail: `CRB Uganda: ${d.crbStatus ?? "unknown"}`,
    },
    {
      key: "savings", label: "Savings Behavior", weight: 0.15,
      value: clamp((d.savingsBalance ?? 0) / 500000, 0, 1),
      detail: `UGX ${(d.savingsBalance ?? 0).toLocaleString()} saved`,
    },
    {
      key: "kyc", label: "KYC Verification", weight: 0.15,
      value: d.kycVerified ? 1 : 0,
      detail: d.kycVerified ? "Fully verified" : "Unverified",
    },
    {
      key: "repayment", label: "Repayment History", weight: 0.30,
      value: (d.loansTotal ?? 0) > 0 ? clamp((d.loansRepaid ?? 0) / (d.loansTotal as number), 0, 1) : 0.5,
      detail: `${d.loansRepaid ?? 0}/${d.loansTotal ?? 0} loans repaid on time`,
    },
  ];

  const weighted = factors.reduce((acc, f) => acc + f.value * f.weight, 0);
  const score = round(300 + 550 * weighted);
  const tier =
    score >= 800 ? "Excellent" : score >= 740 ? "Very Good" :
    score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";

  return {
    score,
    maxScore: 850,
    tier,
    percentile: clamp(round(weighted * 100), 1, 99),
    factors: factors.map((f) => ({
      key: f.key, label: f.label, detail: f.detail,
      weightPercent: round(f.weight * 100),
      contribution: round(f.value * f.weight * 550),
      ratingPercent: round(f.value * 100),
    })),
  };
}

// ── Disbursement (mobile-money payout) ──────────────────────────────────────
export interface DisbursementInput {
  appId: string;
  amount: number;
  channel: string;
  msisdn: string;
}

export interface DisbursementRecord {
  id: string;
  appId: string;
  amount: number;
  channel: string;
  msisdn: string;
  providerRef: string;
  requestedAt: number;
  etaSeconds: number;
}

export function createDisbursement({ appId, amount, channel, msisdn }: DisbursementInput, id?: string): DisbursementRecord {
  return {
    id: id ?? `DISB-${Date.now()}`,
    appId,
    amount,
    channel: channel || "MTN MoMo",
    msisdn: msisdn || "+256 770 123 456",
    providerRef: `${(channel || "MTN").slice(0, 3).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`,
    requestedAt: Date.now(),
    etaSeconds: 120,
  };
}

export function disbursementStatus(disb: DisbursementRecord, now = Date.now()) {
  const elapsed = (now - disb.requestedAt) / 1000;
  const status = elapsed >= 3 ? "completed" : "processing";
  return { ...disb, status, completedAt: status === "completed" ? disb.requestedAt + 3000 : null };
}

// ── Repayment schedule + auto-collection ─────────────────────────────────────
const DAY = 86400000;

export interface RepaymentRecord {
  loanId: string;
  total: number;
  amountPaid: number;
  disbursedAt: number;
  dueDate: number;
  status: "scheduled" | "paid" | "overdue";
  autoPayEnabled: boolean;
  attempts: Array<{ at: number; method: string; amount: number; success: boolean; reason: string }>;
}

export function createRepayment({ loanId, total, termDays, disbursedAt = Date.now() }: {
  loanId: string; total: number; termDays: number; disbursedAt?: number;
}): RepaymentRecord {
  return {
    loanId, total, amountPaid: 0, disbursedAt,
    dueDate: disbursedAt + termDays * DAY,
    status: "scheduled", autoPayEnabled: true, attempts: [],
  };
}

export interface CollectionStage {
  stage: "paid" | "scheduled" | "reminder" | "auto-collect" | "retry" | "calling" | "escalated" | "legal";
  label: string;
  daysToDue: number;
  daysPastDue?: number;
}

export function collectionStage(repayment: { status: string; dueDate: number }, now = Date.now()): CollectionStage {
  if (repayment.status === "paid") return { stage: "paid", label: "Repaid", daysToDue: 0 };
  const daysToDue = Math.ceil((repayment.dueDate - now) / DAY);
  const daysPastDue = Math.max(0, -daysToDue);
  let stage: CollectionStage["stage"] = "scheduled";
  let label = `Due in ${daysToDue} days`;
  if (daysToDue <= 3 && daysToDue > 0) { stage = "reminder"; label = "SMS reminder sent"; }
  if (daysToDue <= 0 && daysPastDue === 0) { stage = "auto-collect"; label = "Auto-collecting from wallet"; }
  if (daysPastDue >= 1) { stage = "retry"; label = "Retry + push notification"; }
  if (daysPastDue >= 7) { stage = "calling"; label = "Collections team calling"; }
  if (daysPastDue >= 30) { stage = "escalated"; label = "Escalated to senior collections"; }
  if (daysPastDue >= 90) { stage = "legal"; label = "Legal action initiated"; }
  return { stage, label, daysToDue, daysPastDue };
}

export interface AutoPayAttempt {
  at: number;
  method: string;
  amount: number;
  success: boolean;
  reason: string;
}

export function attemptAutoPay(repayment: { total: number; amountPaid: number }, walletBalance: number, now = Date.now()): AutoPayAttempt {
  const outstanding = repayment.total - repayment.amountPaid;
  const ok = walletBalance >= outstanding;
  return {
    at: now,
    method: "momo-auto-debit",
    amount: outstanding,
    success: ok,
    reason: ok ? "collected" : "insufficient-wallet-balance",
  };
}

/** Partial repayment — user chooses how much to pay now (min 1 UGX up to outstanding). */
export function attemptPartialPay(
  repayment: { total: number; amountPaid: number },
  walletBalance: number,
  payAmount: number,
  now = Date.now(),
): AutoPayAttempt {
  const outstanding = repayment.total - repayment.amountPaid;
  const amount = Math.min(Math.max(Math.round(payAmount), 1), outstanding);
  const ok = walletBalance >= amount && amount > 0;
  return {
    at: now,
    method: "momo-partial-debit",
    amount,
    success: ok,
    reason: ok ? "partial-payment-collected" : amount <= 0 ? "invalid-amount" : "insufficient-wallet-balance",
  };
}

/** Simple pro-rata interest accrued since the balance was last touched. */
export function accrueSavingsInterest(balance: number, sinceMs: number, now = Date.now()): number {
  const days = Math.max(0, (now - sinceMs) / DAY);
  return round(balance * COMPLIANCE.SAVINGS_APR * (days / 365));
}

// ── Loan application rules ───────────────────────────────────────────────────
export const LOAN_RULES = {
  MIN_AMOUNT: 20000,
  MAX_AMOUNT: 1000000,
  TERMS: [91, 180, 365],
  PURPOSES: ["emergency", "business", "salary_advance", "goal"],
  METHODS: ["mtn_momo", "airtel_money", "bank"],
} as const;

export function validateApplication(input: { amount: number; termDays: number; purpose: string; method: string }):
  { ok: true } | { ok: false; error: string } {
  const a = Number(input.amount);
  if (!Number.isFinite(a) || a < LOAN_RULES.MIN_AMOUNT || a > LOAN_RULES.MAX_AMOUNT) {
    return { ok: false, error: `Amount must be between UGX ${LOAN_RULES.MIN_AMOUNT.toLocaleString()} and UGX ${LOAN_RULES.MAX_AMOUNT.toLocaleString()}` };
  }
  if (!LOAN_RULES.TERMS.includes(Number(input.termDays) as 91 | 180 | 365)) {
    return { ok: false, error: `Term must be one of ${LOAN_RULES.TERMS.join(", ")} days` };
  }
  if (!LOAN_RULES.PURPOSES.includes(String(input.purpose) as typeof LOAN_RULES.PURPOSES[number])) {
    return { ok: false, error: `Purpose must be one of ${LOAN_RULES.PURPOSES.join(", ")}` };
  }
  if (!LOAN_RULES.METHODS.includes(String(input.method) as typeof LOAN_RULES.METHODS[number])) {
    return { ok: false, error: `Disbursement method must be one of ${LOAN_RULES.METHODS.join(", ")}` };
  }
  return { ok: true };
}

// ── Eligibility scoring (0–100) — the underwriting score ─────────────────────
export interface EligibilityInput {
  avgMonthlyBalance?: number;
  crbScore?: number;
  savingsBalance?: number;
  loansRepaid?: number;
  kycVerified?: boolean;
}

export interface EligibilityResult {
  score: number;
  eligible: boolean;
  maxAmount: number;
  interestRate: number;
  tier: "A" | "B" | "C" | "D";
  breakdown: { momo: number; crb: number; savings: number; repayment: number; kyc: number };
}

export function computeEligibility(d: EligibilityInput): EligibilityResult {
  const bal = d.avgMonthlyBalance ?? 0;
  const momo = bal > 50000 ? 30 : bal > 20000 ? 20 : bal > 5000 ? 10 : 0;
  const crb = round(clamp((d.crbScore ?? 0) / 1000, 0, 1) * 25);
  const s = d.savingsBalance ?? 0;
  const savings = s > 100000 ? 20 : s > 50000 ? 15 : s > 10000 ? 10 : 0;
  const n = d.loansRepaid ?? 0;
  const repayment = n >= 10 ? 15 : n >= 8 ? 13 : n >= 6 ? 11 : n >= 4 ? 9 : n >= 2 ? 5 : 0;
  const kyc = d.kycVerified ? 10 : 0;

  const score = momo + crb + savings + repayment + kyc;

  let eligible: boolean, maxAmount: number, interestRate: number, tier: EligibilityResult["tier"];
  if (score >= 80)      { eligible = true;  maxAmount = 1000000; interestRate = 0.22; tier = "A"; }
  else if (score >= 70) { eligible = true;  maxAmount = 500000;  interestRate = 0.24; tier = "B"; }
  else if (score >= 60) { eligible = true;  maxAmount = 200000;  interestRate = 0.26; tier = "C"; }
  else                  { eligible = false; maxAmount = 0;       interestRate = 0;    tier = "D"; }

  return { score, eligible, maxAmount, interestRate, tier, breakdown: { momo, crb, savings, repayment, kyc } };
}

// ── Pricing v2 — tiered rate + service fee, all-in APR clamped ≤ MAX_APR ─────
export interface PricingV2Input {
  principal: number;
  termDays: number;
  interestRate: number;
  serviceFeeRate?: number;
}

export interface PricingV2Result {
  principal: number;
  termDays: number;
  interestRate: number;
  serviceFeeRate: number;
  interest: number;
  serviceFee: number;
  total: number;
  apr: number;
  aprPercent: number;
  clamped: boolean;
  compound: boolean;
}

export function priceLoanV2({ principal, termDays, interestRate, serviceFeeRate = 0.10 }: PricingV2Input): PricingV2Result {
  const term = Math.max(COMPLIANCE.MIN_TERM_DAYS, Math.round(termDays));
  const rawInterest = principal * interestRate * (term / 365);
  const rawFee = principal * serviceFeeRate;
  let interest = rawInterest, serviceFee = rawFee;

  const capCost = principal * COMPLIANCE.MAX_APR * (term / 365);
  const rawCost = rawInterest + rawFee;
  let clamped = false;
  if (rawCost > capCost) {
    const scale = capCost / rawCost;
    interest = rawInterest * scale;
    serviceFee = rawFee * scale;
    clamped = true;
  }
  interest = round(interest);
  serviceFee = round(serviceFee);
  const total = principal + interest + serviceFee;
  const apr = (interest + serviceFee) / principal * (365 / term);

  return {
    principal, termDays: term, interestRate, serviceFeeRate,
    interest, serviceFee, total,
    apr: Number(apr.toFixed(4)),
    aprPercent: Number((apr * 100).toFixed(1)),
    clamped, compound: false,
  };
}
