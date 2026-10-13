import { Router, Request, Response } from "express";
import { parseMarzPayWebhook } from "../lib/marzpay.js";
import { settleMarzPayEvent } from "../lib/marzpay-settlement.js";

const router = Router();

// Authentication (provider signature, or the shared token outside live money) and
// replay protection run first in production-security-guards.ts, which marks the
// request as authenticated. Without that mark nothing is applied.
router.post("/marzpay/webhook", async (req: Request, res: Response) => {
  if (res.locals.marzpayWebhookAuthenticated !== true) {
    res.status(401).json({ error: "Invalid webhook authentication" });
    return;
  }
  const outcome = await settleMarzPayEvent(parseMarzPayWebhook(req.body));
  res.status(outcome.httpStatus).json(outcome.body);
});

export default router;
