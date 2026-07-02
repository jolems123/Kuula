/**
 * Compliance module: GET /api/compliance — public endpoint, returns the
 * compliance constants the in-app disclosures read from.
 */
import { Router } from "express";
import { COMPLIANCE } from "../../lib/core.js";

export const complianceRouter = Router();

complianceRouter.get("/", (_req, res) => {
  res.json({
    maxAprPercent: COMPLIANCE.MAX_APR * 100,
    appleAprCapPercent: COMPLIANCE.APPLE_APR_CAP * 100,
    minTermDays: COMPLIANCE.MIN_TERM_DAYS,
    googleMinTermDays: COMPLIANCE.GOOGLE_MIN_TERM_DAYS,
    savingsAprPercent: COMPLIANCE.SAVINGS_APR * 100,
    savingsDiscountPercent: COMPLIANCE.SAVINGS_DISCOUNT * 100,
    savingsThreshold: COMPLIANCE.SAVINGS_THRESHOLD,
    compound: false,
    dataRetentionYears: 10,
  });
});

complianceRouter.get("/rules", (_req, res) => {
  // Loan rules — also exposed for the calculator UI.
  res.json({
    MIN_AMOUNT: 20000,
    MAX_AMOUNT: 1000000,
    TERMS: [91, 180, 365],
    PURPOSES: ["emergency", "business", "salary_advance", "goal"],
    METHODS: ["mtn_momo", "airtel_money", "bank"],
  });
});
