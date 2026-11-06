/** Kuula's fixed 3% customer payment fee, disclosed and frozen on acceptance.
 * Provider charges are separate expenses and may differ from this customer fee.
 * payoutFee below uses the published MarzPay tariff for funding checks only.
 */
export const PAYMENT_FEE_POLICY = "kuula-fixed-three-percent-2026-11-06";
export const COLLECTION_BPS = 300;
export function collectionQuote(loanCredit: number, enabled = true) {
  if (!Number.isSafeInteger(loanCredit) || loanCredit <= 0) throw new RangeError("Repayment must be a positive whole UGX amount");
  const totalDebit = enabled ? loanCredit + Math.ceil(loanCredit * COLLECTION_BPS / 10000) : loanCredit;
  if (totalDebit < 500 || totalDebit > 10_000_000) throw new RangeError("Total mobile-money debit including fees must be between UGX 500 and UGX 10,000,000");
  return { policyVersion: enabled ? PAYMENT_FEE_POLICY : "legacy-lender-paid", loanCredit, customerFee: totalDebit - loanCredit, totalDebit, collectionBps: enabled ? COLLECTION_BPS : 0 };
}
export function payoutFee(net: number): number {
  if (!Number.isSafeInteger(net) || net < 500 || net > 5_000_000) throw new RangeError("No verified payout fee for this amount");
  return net <= 50_000 ? 1000 : net <= 300_000 ? 1500 : net <= 750_000 ? 2800 : 5000;
}
/** Deduct 3% of the approved principal, rounded up to whole UGX. */
export function payoutQuote(budget: number) {
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new RangeError("Principal must be a positive whole UGX amount");
  const customerFee = Math.ceil(budget * COLLECTION_BPS / 10000);
  const net = budget - customerFee;
  if (net < 500) throw new RangeError("Net payout is below the provider minimum");
  return { budget, net, customerFee };
}
export interface PaymentFeeDisclosure {
  policyVersion: string;
  principal: number;
  payoutFee: number;
  netDisbursement: number;
  collectionBps: number;
  legs: Array<{ budget: number; net: number; customerFee: number }>;
}
export function acceptedPaymentFees(snapshot: unknown): PaymentFeeDisclosure | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as { paymentFees?: PaymentFeeDisclosure }).paymentFees;
  return value?.policyVersion === PAYMENT_FEE_POLICY ? value : null;
}
