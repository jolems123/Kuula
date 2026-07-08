// Shared domain logic for Edge Functions (Deno). Mirrors src/app/lib/pricing.ts.
export const COMPLIANCE = {
  MAX_APR: 0.336,
  APPLE_APR_CAP: 0.36,
  MIN_TERM_DAYS: 90,
  SAVINGS_DISCOUNT: 0.05,
  SAVINGS_THRESHOLD: 100000,
  SAVINGS_APR: 0.05,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);

export interface ScoreInput {
  momoMonths: number; momoTxnCount: number; crbStatus: string;
  savingsBalance: number; kycVerified: boolean; loansRepaid: number; loansTotal: number;
}

export function computeCreditScore(d: ScoreInput) {
  const factors = [
    { key: "momo", label: "Mobile Money History", weight: 0.25,
      value: (clamp((d.momoMonths ?? 0) / 12, 0, 1) + clamp((d.momoTxnCount ?? 0) / 100, 0, 1)) / 2,
      detail: `${d.momoMonths ?? 0} months · ${d.momoTxnCount ?? 0} transactions` },
    { key: "crb", label: "Credit Reference Bureau", weight: 0.15,
      value: d.crbStatus === "clean" ? 1 : d.crbStatus === "thin" ? 0.6 : 0.25,
      detail: `CRB Uganda: ${d.crbStatus ?? "unknown"}` },
    { key: "savings", label: "Savings Behavior", weight: 0.15,
      value: clamp((d.savingsBalance ?? 0) / 500000, 0, 1),
      detail: `UGX ${(d.savingsBalance ?? 0).toLocaleString()} saved` },
    { key: "kyc", label: "KYC Verification", weight: 0.15,
      value: d.kycVerified ? 1 : 0, detail: d.kycVerified ? "Fully verified" : "Unverified" },
    { key: "repayment", label: "Repayment History", weight: 0.30,
      value: (d.loansTotal ?? 0) > 0 ? clamp((d.loansRepaid ?? 0) / d.loansTotal, 0, 1) : 0.5,
      detail: `${d.loansRepaid ?? 0}/${d.loansTotal ?? 0} loans repaid on time` },
  ];
  const weighted = factors.reduce((acc, f) => acc + f.value * f.weight, 0);
  const score = round(300 + 550 * weighted);
  const tier = score >= 800 ? "Excellent" : score >= 740 ? "Very Good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";
  return {
    score, maxScore: 850, tier, percentile: clamp(round(weighted * 100), 1, 99),
    factors: factors.map((f) => ({
      key: f.key, label: f.label, detail: f.detail,
      weightPercent: round(f.weight * 100),
      contribution: round(f.value * f.weight * 550),
      ratingPercent: round(f.value * 100),
    })),
  };
}

const DAY = 86400000;
export function collectionStage(dueDate: number, status: string, now = Date.now()) {
  if (status === "paid") return { stage: "paid", label: "Repaid", daysPastDue: 0 };
  const daysToDue = Math.ceil((dueDate - now) / DAY);
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
