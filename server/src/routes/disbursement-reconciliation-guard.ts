import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook } from "../lib/marzpay.js";

const router = Router();

// A provider amount/UUID mismatch is a hard financial stop. Once a leg has
// been flagged for reconciliation, later callbacks cannot silently overwrite
// that state. An authorized reconciliation review must first move the ledger
// to `reviewed`, after which a verified provider callback may settle it.
router.post("/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  const event = parseMarzPayWebhook(req.body);
  if (!event.reference) return next();

  const transaction = await prisma.transaction.findUnique({
    where: { reference: event.reference },
    select: { type: true, status: true, reconciliationStatus: true },
  });
  if (!transaction || transaction.type !== "loan_disbursement_leg") return next();

  if (transaction.status === "pending" && transaction.reconciliationStatus === "reconciliation_required") {
    res.status(409).json({
      error: "This disbursement transaction requires reconciliation review before settlement can continue",
      code: "DISBURSEMENT_RECONCILIATION_REQUIRED",
    });
    return;
  }
  next();
});

export default router;
