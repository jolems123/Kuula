/** Published Uganda mobile-money rates, checked 2026-11-06.
 * https://wallet.wearemarz.com/pricing — not applicable to cards or other markets.
 * Persist this policy with each accepted agreement; never reprice existing agreements.
 */
export const PAYMENT_FEE_POLICY = "marzpay-ug-mobile-money-2026-11-06";
export const COLLECTION_BPS = 300;
export function collectionQuote(loanCredit: number, enabled = true) {
  if (!Number.isSafeInteger(loanCredit) || loanCredit <= 0) throw new RangeError("Repayment must be a positive whole UGX amount");
  const totalDebit = enabled ? Math.ceil(loanCredit * 10000 / (10000 - COLLECTION_BPS)) : loanCredit;
  if (totalDebit < 500 || totalDebit > 10_000_000) throw new RangeError("Total mobile-money debit including fees must be between UGX 500 and UGX 10,000,000");
  return { policyVersion: enabled ? PAYMENT_FEE_POLICY : "legacy-lender-paid", loanCredit, customerFee: totalDebit - loanCredit, totalDebit, collectionBps: enabled ? COLLECTION_BPS : 0 };
}
export function payoutFee(net: number): number {
  if (!Number.isSafeInteger(net) || net < 500 || net > 5_000_000) throw new RangeError("No verified payout fee for this amount");
  return net <= 50_000 ? 1000 : net <= 300_000 ? 1500 : net <= 750_000 ? 2800 : 5000;
}
/** Find a net transfer whose published flat fee exactly uses the approved budget.
 * Reject tariff gaps instead of inventing a fee or retaining undisclosed change. */
export function payoutQuote(budget: number) {
  for (const fee of [1000, 1500, 2800, 5000]) {
    const net = budget - fee;
    if (net >= 500 && net <= 5_000_000 && payoutFee(net) === fee) return { budget, net, customerFee: fee };
  }
  throw new RangeError("Approved amount cannot be paid exactly under the verified provider tariff; request a revised offer");
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
/** Recovery is capped at the agreed fee; a lower actual fee belongs to the customer. */
export function recoveredProviderFee(agreed: bigint, actual: bigint): bigint {
  return agreed < actual ? agreed : actual;
}
