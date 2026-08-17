import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

router.get("/operations/search", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  const queryLength = String(req.query.q || "").trim().length;
  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "credit.customer_search_executed",
    resourceType: "credit_operations_search",
    metadata: { queryLength },
  });
  next();
});

router.get("/operations/applications/:id", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "credit.case_viewed",
    resourceType: "loan_application",
    resourceId: String(req.params.id),
  });
  next();
});

router.get("/admin/kyc/:id/document/:side", authenticateToken, async (req: Request, _res: Response, next: NextFunction) => {
  // The KYC route itself records document access after authorization; this
  // pre-event records the attempt so denied/suspicious access is also visible.
  await writeAuditEvent({
    actorId: req.user!.userId,
    action: "kyc.document_access_attempted",
    resourceType: "kyc_submission",
    resourceId: String(req.params.id),
    metadata: { side: String(req.params.side || "") },
  });
  next();
});

export default router;
