import { Router } from "express";

/**
 * Fail-closed guards for routes that still exist in older compatibility routers.
 * Canonical handlers are mounted before these guards. Reaching a guard means the
 * canonical route unexpectedly fell through, so stale money-moving code must not run.
 */
export const loanFinancialFallbackGuard = Router();
loanFinancialFallbackGuard.post("/:id/accept", (_req, res) => {
  res.status(503).json({
    error: "Loan disbursement fallback is disabled. Use the canonical provider-aware disbursement flow.",
    code: "LEGACY_LOAN_DISBURSEMENT_DISABLED",
  });
});

export const networkFinancialFallbackGuard = Router();
networkFinancialFallbackGuard.post("/partner-financing", (_req, res) => {
  res.status(503).json({
    error: "Legacy partner-financing fallback is disabled. Use the canonical restricted-purpose financing flow.",
    code: "LEGACY_PARTNER_FINANCING_DISABLED",
  });
});
