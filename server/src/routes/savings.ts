import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { SAVINGS_POLICY } from "../lib/savings-policy.js";

const router = Router();

// Savings remains visible as a planned product, but no stored legacy balance is
// represented as customer money until custody and provider settlement are live.
router.get("/", authenticateToken, async (_req: Request, res: Response) => {
  res.json({
    balance: SAVINGS_POLICY.recognizedBalance,
    accruedInterest: SAVINGS_POLICY.accruedInterest,
    aprPercent: SAVINGS_POLICY.aprPercent,
    operationsEnabled: SAVINGS_POLICY.operationsEnabled,
    status: SAVINGS_POLICY.status,
    message: SAVINGS_POLICY.message,
  });
});

function unavailable(_req: Request, res: Response): void {
  res.status(503).json({
    error: SAVINGS_POLICY.message,
    code: "SAVINGS_OPERATIONS_DISABLED",
    operationsEnabled: false,
  });
}

router.post("/deposit", authenticateToken, unavailable);
router.post("/withdraw", authenticateToken, unavailable);

export default router;
