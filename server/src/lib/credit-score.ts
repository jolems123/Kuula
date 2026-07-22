/**
 * Credit scoring engine — mirrored from supabase/functions/_shared/core.ts
 */

interface ScoreInput {
  momoMonths: number;
  momoTxnCount: number;
  crbStatus: string;
  savingsBalance: number;
  kycVerified: boolean;
  loansRepaid: number;
  loansTotal: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);

export function computeCreditScore(d: ScoreInput) {
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
  const tier = score >= 800 ? "Excellent" : score >= 740 ? "Very Good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";

  return {
    score,
    maxScore: 850,
    tier,
    percentile: clamp(round(weighted * 100), 1, 99),
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
