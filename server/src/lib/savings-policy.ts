export const SAVINGS_POLICY = {
  operationsEnabled: false,
  recognizedBalance: 0,
  accruedInterest: 0,
  aprPercent: 0,
  status: "unavailable" as const,
  message:
    "Savings deposits and withdrawals are temporarily unavailable while regulated custody and provider settlement are being completed.",
} as const;

/**
 * Until savings money is collected, safeguarded, and paid out through a
 * verified provider ledger, legacy database balances are not recognized for
 * customer funds, credit scoring, pricing discounts, or investor reporting.
 */
export function recognizedSavingsBalance(_storedBalance: unknown): number {
  return SAVINGS_POLICY.recognizedBalance;
}
