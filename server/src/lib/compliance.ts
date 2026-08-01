export const COMPLIANCE = {
  maxAprPercent: 33.6,
  appleAprCapPercent: 36,
  minTermDays: 90,
  googleMinTermDays: 61,
  // Savings operations are disabled until regulated custody and settlement are live.
  savingsAprPercent: 0,
  savingsDiscountPercent: 0,
  savingsThreshold: 0,
  compound: false,
  dataRetentionYears: 10,
} as const;
