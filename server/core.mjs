/**
 * Kuula domain core — the real business logic behind the product claims.
 *
 * Pure, dependency-free functions so they are trivially testable and portable
 * to a production service. Compliance constants are centralised here:
 *
 *  - MAX_APR (33.6%) is the all-in effective rate ceiling. It is kept BELOW
 *    Apple's hard 36% APR cap for loan apps; pricing asserts against it.
 *  - MIN_TERM_DAYS (90) keeps every loan well above Google Play's rule that
 *    bans personal-loan apps requiring full repayment in 60 days or less.
 *  - Interest is SIMPLE (never compounded): cost = principal × dailyRate × days.
 */

export const COMPLIANCE = {
  MAX_APR: 0.336,            // Kuula's advertised all-in ceiling
  APPLE_APR_CAP: 0.36,       // App Store hard limit — we must stay under this
  GOOGLE_MIN_TERM_DAYS: 61,  // Play bans full repayment in <= 60 days
  MIN_TERM_DAYS: 90,         // product minimum (comfortably above Google's)
  SAVINGS_DISCOUNT: 0.05,    // -5% APR incentive
  SAVINGS_THRESHOLD: 100000, // UGX savings that unlocks the discount
  SAVINGS_APR: 0.05,         // interest paid on savings
};

const round = (n) => Math.round(n);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ── Pricing engine ────────────────────────────────────────────────────────────
/**
 * Price a loan with SIMPLE interest and an all-in APR that can never exceed the
 * advertised ceiling (and therefore never Apple's cap). The savings discount
 * lowers the APR for customers with a healthy balance ("credit ladder").
 */
export function priceLoan({ principal, termDays, savingsBalance = 0 }) {
  const term = Math.max(COMPLIANCE.MIN_TERM_DAYS, Math.round(termDays || COMPLIANCE.MIN_TERM_DAYS));
  const discount = savingsBalance >= COMPLIANCE.SAVINGS_THRESHOLD ? COMPLIANCE.SAVINGS_DISCOUNT : 0;
  const apr = clamp(COMPLIANCE.MAX_APR - discount, 0, COMPLIANCE.MAX_APR);

  const dailyRate = apr / 365;
  const interest = round(principal * dailyRate * term);
  const total = principal + interest;

  // All-in APR including every charge (there are no hidden fees) — this is the
  // number Apple/Google check. Guard against ever shipping a non-compliant price.
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

// ── AI credit scoring engine ──────────────────────────────────────────────────
/**
 * Weighted score from the five advertised data sources. Returns a 300–850 score,
 * tier, and a per-factor breakdown so the UI and admin model screen show real,
 * explainable numbers instead of a hardcoded value.
 */
export function computeCreditScore(d) {
  const factors = [
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
      value: (d.loansTotal ?? 0) > 0 ? clamp((d.loansRepaid ?? 0) / d.loansTotal, 0, 1) : 0.5,
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
    percentile: clamp(round((weighted) * 100), 1, 99),
    factors: factors.map((f) => ({
      key: f.key,
      label: f.label,
      detail: f.detail,
      weightPercent: round(f.weight * 100),
      contribution: round(f.value * f.weight * 550),
      ratingPercent: round(f.value * 100),
    })),
  };
}

// ── Disbursement (sandbox MTN MoMo / Airtel Money) ────────────────────────────
/**
 * Models a mobile-money payout. A real provider call goes where noted; the
 * sandbox completes within seconds to honour the "instant (≤2 min)" promise.
 * Status is derived from elapsed time so it advances without timers.
 */
export function createDisbursement({ appId, amount, channel, msisdn }) {
  return {
    id: `DISB-${Date.now()}`,
    appId,
    amount,
    channel: channel || "MTN MoMo",
    msisdn: msisdn || "+256 770 123 456",
    // TODO(provider): POST to MTN MoMo /disbursement or Airtel /payouts here.
    providerRef: `${(channel || "MTN").slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    requestedAt: Date.now(),
    etaSeconds: 120,
  };
}

export function disbursementStatus(disb, now = Date.now()) {
  const elapsed = (now - disb.requestedAt) / 1000;
  const status = elapsed >= 3 ? "completed" : "processing";
  return {
    ...disb,
    status,
    completedAt: status === "completed" ? disb.requestedAt + 3000 : null,
  };
}

// ── Repayment schedule + auto-collection engine ───────────────────────────────
const DAY = 86400000;

export function createRepayment({ loanId, total, termDays, disbursedAt = Date.now() }) {
  return {
    loanId,
    total,
    amountPaid: 0,
    disbursedAt,
    dueDate: disbursedAt + termDays * DAY,
    status: "scheduled",   // scheduled | paid | overdue
    autoPayEnabled: true,
    attempts: [],
  };
}

/**
 * The collection ladder, derived from how far past due an unpaid loan is —
 * exactly the stages in the product spec.
 */
export function collectionStage(repayment, now = Date.now()) {
  if (repayment.status === "paid") return { stage: "paid", label: "Repaid", daysPastDue: 0 };
  const daysToDue = Math.ceil((repayment.dueDate - now) / DAY);
  const daysPastDue = Math.max(0, -daysToDue);
  let stage = "scheduled", label = `Due in ${daysToDue} days`;
  if (daysToDue <= 3 && daysToDue > 0) { stage = "reminder"; label = "SMS reminder sent"; }
  if (daysToDue <= 0 && daysPastDue === 0) { stage = "auto-collect"; label = "Auto-collecting from wallet"; }
  if (daysPastDue >= 1) { stage = "retry"; label = "Retry + push notification"; }
  if (daysPastDue >= 7) { stage = "calling"; label = "Collections team calling"; }
  if (daysPastDue >= 30) { stage = "escalated"; label = "Escalated to senior collections"; }
  if (daysPastDue >= 90) { stage = "legal"; label = "Legal action initiated"; }
  return { stage, label, daysPastDue, daysToDue };
}

/**
 * Attempt an automatic mobile-money debit. Returns whether it succeeded; the
 * caller records the attempt and marks the loan paid on success.
 */
export function attemptAutoPay(repayment, walletBalance, now = Date.now()) {
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

// ── Savings (interest accrual) ────────────────────────────────────────────────
/** Simple pro-rata interest accrued since the balance was last touched. */
export function accrueSavingsInterest(balance, sinceMs, now = Date.now()) {
  const days = Math.max(0, (now - sinceMs) / DAY);
  return round(balance * COMPLIANCE.SAVINGS_APR * (days / 365));
}

// ── Loan application rules ────────────────────────────────────────────────────
export const LOAN_RULES = {
  MIN_AMOUNT: 20000,
  MAX_AMOUNT: 1000000,
  TERMS: [91, 180, 365],          // all > 60 days (Google), >= 90 (product)
  PURPOSES: ["emergency", "business", "salary_advance", "goal"],
  METHODS: ["mtn_momo", "airtel_money", "bank"],
};

/** Validate an application; returns { ok, error }. */
export function validateApplication({ amount, termDays, purpose, method }) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a < LOAN_RULES.MIN_AMOUNT || a > LOAN_RULES.MAX_AMOUNT) {
    return { ok: false, error: `Amount must be between UGX ${LOAN_RULES.MIN_AMOUNT.toLocaleString()} and UGX ${LOAN_RULES.MAX_AMOUNT.toLocaleString()}` };
  }
  if (!LOAN_RULES.TERMS.includes(Number(termDays))) {
    return { ok: false, error: `Term must be one of ${LOAN_RULES.TERMS.join(", ")} days` };
  }
  if (!LOAN_RULES.PURPOSES.includes(String(purpose))) {
    return { ok: false, error: `Purpose must be one of ${LOAN_RULES.PURPOSES.join(", ")}` };
  }
  if (!LOAN_RULES.METHODS.includes(String(method))) {
    return { ok: false, error: `Disbursement method must be one of ${LOAN_RULES.METHODS.join(", ")}` };
  }
  return { ok: true };
}

// ── Eligibility scoring (0–100) — the underwriting score ──────────────────────
/**
 * Underwriting score per the product spec (separate from the 300–850 display
 * score). 5 weighted sources sum to 0–100, then map to an eligibility tier.
 */
export function computeEligibility(d) {
  // 1. Mobile money history (30)
  const bal = d.avgMonthlyBalance ?? 0;
  const momo = bal > 50000 ? 30 : bal > 20000 ? 20 : bal > 5000 ? 10 : 0;
  // 2. CRB score 0–1000 (25)
  const crb = round(clamp((d.crbScore ?? 0) / 1000, 0, 1) * 25);
  // 3. Savings balance (20)
  const s = d.savingsBalance ?? 0;
  const savings = s > 100000 ? 20 : s > 50000 ? 15 : s > 10000 ? 10 : 0;
  // 4. Repayment history, loans paid on time 0–10 (15)
  const n = d.loansRepaid ?? 0;
  const repayment = n >= 10 ? 15 : n >= 8 ? 13 : n >= 6 ? 11 : n >= 4 ? 9 : n >= 2 ? 5 : 0;
  // 5. KYC (10)
  const kyc = d.kycVerified ? 10 : 0;

  const score = momo + crb + savings + repayment + kyc;

  // Eligibility tiers
  let eligible, maxAmount, interestRate, tier;
  if (score >= 80)      { eligible = true;  maxAmount = 1000000; interestRate = 0.22; tier = "A"; }
  else if (score >= 70) { eligible = true;  maxAmount = 500000;  interestRate = 0.24; tier = "B"; }
  else if (score >= 60) { eligible = true;  maxAmount = 200000;  interestRate = 0.26; tier = "C"; }
  else                  { eligible = false; maxAmount = 0;       interestRate = 0;    tier = "D"; }

  return {
    score, eligible, maxAmount, interestRate, tier,
    breakdown: { momo, crb, savings, repayment, kyc },
  };
}

// ── Pricing v2 — tiered rate + service fee, all-in APR clamped ≤ 33.6% ─────────
/**
 * Prices a loan from the eligibility tier's interest rate plus a service fee,
 * using SIMPLE interest. The combined cost is then clamped so the all-in APR
 * never exceeds MAX_APR (33.6%, below Apple's 36% cap). `clamped` flags when the
 * nominal tier rate + fee would have breached the cap and was reduced.
 */
export function priceLoanV2({ principal, termDays, interestRate, serviceFeeRate = 0.10 }) {
  const term = Math.max(COMPLIANCE.MIN_TERM_DAYS, Math.round(termDays));
  const rawInterest = principal * interestRate * (term / 365);
  const rawFee = principal * serviceFeeRate;
  let interest = rawInterest, serviceFee = rawFee;

  const capCost = principal * COMPLIANCE.MAX_APR * (term / 365); // max total cost at the APR ceiling
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
    principal, termDays: term,
    interestRate, serviceFeeRate,
    interest, serviceFee, total,
    apr: Number(apr.toFixed(4)),
    aprPercent: Number((apr * 100).toFixed(1)),
    clamped,
    compound: false,
  };
}
