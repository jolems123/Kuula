import { Router, Request, Response } from "express";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { writeAuditEvent } from "../lib/audit.js";
import { approveAndSendRefund, cancelRefund, listRefunds, refundableSources, requestRefund } from "../lib/refunds.js";

// Refunds of customer money Kuula holds but could not apply to a loan. Requesting needs
// reconciliation rights; approving (which sends money) needs payout-release rights and
// must be done by a different person.
const router = Router();
router.use(authenticateToken);

router.get("/", requirePermissions("reconciliation.manage"), async (_req: Request, res: Response) => {
  const [refunds, sources] = await Promise.all([listRefunds(), refundableSources()]);
  res.json({ refunds, refundable: sources.filter((source) => source.refundable > 0) });
});

router.post("/", requirePermissions("reconciliation.manage"), async (req: Request, res: Response) => {
  const sourceTransactionId = String(req.body?.sourceTransactionId || "");
  if (!/^[0-9a-f-]{36}$/i.test(sourceTransactionId)) throw new AppError("sourceTransactionId is required", 400);
  const id = await requestRefund({ sourceTransactionId, amount: Number(req.body?.amount), reason: String(req.body?.reason || ""), requestedBy: req.user!.userId });
  await writeAuditEvent({ actorId: req.user!.userId, action: "payment.refund_requested", resourceType: "refund_request", resourceId: id, metadata: { sourceTransactionId, amount: Number(req.body?.amount) } });
  res.status(201).json({ id, status: "requested" });
});

router.post("/:id/approve", requirePermissions("disbursement.release"), async (req: Request, res: Response) => {
  const refundId = String(req.params.id);
  const result = await approveAndSendRefund({ refundId, approvedBy: req.user!.userId });
  await writeAuditEvent({ actorId: req.user!.userId, action: "payment.refund_approved", resourceType: "refund_request", resourceId: refundId, metadata: { reference: result.reference, status: result.status } });
  res.json(result);
});

router.post("/:id/cancel", requirePermissions("reconciliation.manage"), async (req: Request, res: Response) => {
  const refundId = String(req.params.id);
  await cancelRefund(refundId);
  await writeAuditEvent({ actorId: req.user!.userId, action: "payment.refund_cancelled", resourceType: "refund_request", resourceId: refundId });
  res.json({ ok: true, status: "cancelled" });
});

export default router;
