/** Kuula's internal, provisional evidence score. NOT a bureau score or a calibrated default prediction.
 * No CRB data is used. Missing evidence earns no points; first-time borrowers are not treated as late payers.
 */
interface ScoreInput {
  momoMonths: number;
  momoTxnCount: number;
  momoVerified?: boolean;
  kycVerified: boolean;
  loansRepaid: number;
  loansTotal: number;
  /** Legacy input ignored deliberately while Kuula does not use CRB reports. */
  crbStatus?: string;
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);

export function computeCreditScore(d: ScoreInput) {
  const hasRepaymentHistory = (d.loansTotal ?? 0) > 0;
  const momoVerified = d.momoVerified === true;
  const factors = [
    {
      key: "kyc", label: "Identity Verification", weight: 0.20,
      value: d.kycVerified ? 1 : 0,
      detail: d.kycVerified ? "Identity verified" : "Identity not verified",
      available: true,
    },
    {
      key: "momo", label: "Verified Mobile Money Activity", weight: 0.40,
      value: momoVerified
        ? (clamp((d.momoMonths ?? 0) / 12, 0, 1) + clamp((d.momoTxnCount ?? 0) / 100, 0, 1)) / 2
        : 0,
      detail: momoVerified
        ? `${d.momoMonths ?? 0} verified months · ${d.momoTxnCount ?? 0} transactions`
        : "No verified mobile money activity on file; no points assigned",
      available: momoVerified,
    },
    {
      key: "repayment", label: "Kuula Repayment History", weight: 0.40,
      value: hasRepaymentHistory ? clamp((d.loansRepaid ?? 0) / d.loansTotal, 0, 1) : 0,
      detail: hasRepaymentHistory
        ? `${d.loansRepaid ?? 0}/${d.loansTotal} Kuula facilities paid on time`
        : "New borrower: no repayment history, no assumed performance",
      available: hasRepaymentHistory,
    },
  ];
  const weighted = factors.reduce((acc, factor) => acc + factor.value * factor.weight, 0);
  const score = round(300 + 550 * weighted);
  const provisional = !momoVerified && !hasRepaymentHistory;
  const tier = provisional ? "Building" : score >= 800 ? "Excellent" : score >= 740 ? "Very Good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : score >= 500 ? "Developing" : "Limited evidence";
  return {
    score,
    maxScore: 850,
    tier,
    provisional,
    /** Index progress, not population percentile (which would require population calibration). */
    percentile: round(weighted * 100),
    factors: factors.map((factor) => ({
      key: factor.key,
      label: factor.label,
      detail: factor.detail,
      weightPercent: round(factor.weight * 100),
      contribution: round(factor.value * factor.weight * 550),
      ratingPercent: round(factor.value * 100),
      available: factor.available,
    })),
  };
}
