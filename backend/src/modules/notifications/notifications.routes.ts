/**
 * Notifications module: list + mark read.
 */
import { Router } from "express";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query(
    `SELECT id, title, body, type, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.auth.userId],
  );
  res.json({ notifications: rows });
}));

notificationsRouter.post("/read", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  await query(`UPDATE notifications SET read = TRUE WHERE user_id = $1`, [req.auth.userId]);
  res.json({ ok: true });
}));

notificationsRouter.post("/read/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  await query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`, [req.params.id, req.auth.userId]);
  res.json({ ok: true });
}));
