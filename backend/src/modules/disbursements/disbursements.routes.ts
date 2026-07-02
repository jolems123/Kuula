/**
 * Disbursements module: direct MTN / Airtel disbursement + collection
 * (admin-only). Used by the admin panel for manual ops.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { mtn } from "../../providers/mtn.js";
import { airtel } from "../../providers/airtel.js";

export const disbursementsRouter = Router();

const disburseSchema = z.object({
  phoneNumber: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

disbursementsRouter.post("/mtn/disburse", requireAuth, requireAdmin, validate({ body: disburseSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { phoneNumber, amount, reference } = req.body as z.infer<typeof disburseSchema>;
  try {
    const r = await mtn.disburse(phoneNumber, Math.round(amount), reference ?? `MANUAL-${Date.now()}`);
    res.json({ success: true, transaction_id: r.transaction_id, simulated: r.simulated });
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
}));

disbursementsRouter.post("/airtel/disburse", requireAuth, requireAdmin, validate({ body: disburseSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { phoneNumber, amount, reference } = req.body as z.infer<typeof disburseSchema>;
  try {
    const r = await airtel.disburse(phoneNumber, Math.round(amount), reference ?? `MANUAL-${Date.now()}`);
    res.json({ success: true, transaction_id: r.transaction_id, simulated: r.simulated });
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
}));

const collectSchema = z.object({
  phoneNumber: z.string(),
  amount: z.number().positive(),
  transactionId: z.string(),
});

disbursementsRouter.post("/mtn/collection", requireAuth, requireAdmin, validate({ body: collectSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { phoneNumber, amount, transactionId } = req.body as z.infer<typeof collectSchema>;
  try {
    const r = await mtn.collect(phoneNumber, Math.round(amount), transactionId);
    res.json({ success: true, transaction_id: r.transaction_id, simulated: r.simulated });
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
}));

disbursementsRouter.post("/airtel/collection", requireAuth, requireAdmin, validate({ body: collectSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { phoneNumber, amount, transactionId } = req.body as z.infer<typeof collectSchema>;
  try {
    const r = await airtel.collect(phoneNumber, Math.round(amount), transactionId);
    res.json({ success: true, transaction_id: r.transaction_id, simulated: r.simulated });
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
}));
