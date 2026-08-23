import { Router } from "express";

/**
 * Fail-closed guards for routes that still exist in older compatibility routers.
 * Canonical handlers are mounted before these guards. Reaching a guard means the
 * canonical route unexpectedly fell through, so stale money-moving or broad-read
 * compatibility code must not run.
 */
export const loanFinancialFallbackGuard = Router();
loanFinancialFallbackGuard.get("/applications", (_req, res) => {
  res.status(503).json({
    error: "Legacy broad application reads are disabled. Use the canonical assignment-scoped application reader.",
    code: "LEGACY_APPLICATION_READ_DISABLED",
  });
});
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
