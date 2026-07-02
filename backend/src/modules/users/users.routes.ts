/**
 * Users module: profile read + update + soft delete (account deletion).
 */
import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { serializeUser } from "../../lib/serialize.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query(
    `SELECT id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, avatar_url
     FROM users WHERE id = $1`,
    [req.auth.userId],
  );
  if (!rows[0]) throw new ApiError(404, "User not found");
  res.json({ user: serializeUser(rows[0] as any) });
}));

const updateSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  district: z.string().max(80).optional(),
  occupation: z.string().max(80).optional(),
  dateOfBirth: z.string().max(40).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

usersRouter.patch("/me", requireAuth, validate({ body: updateSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const patch = req.body as z.infer<typeof updateSchema>;
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = k === "fullName" ? "full_name" : k === "dateOfBirth" ? "date_of_birth" : k === "avatarUrl" ? "avatar_url" : k;
    sets.push(`${col} = $${i++}`);
    values.push(v);
  }
  if (sets.length === 0) throw new ApiError(400, "Nothing to update");
  values.push(req.auth.userId);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${i}`, values);
  const { rows } = await query(
    `SELECT id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, avatar_url
     FROM users WHERE id = $1`,
    [req.auth.userId],
  );
  res.json({ user: serializeUser(rows[0] as any) });
}));

usersRouter.post("/me/delete", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  await query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [req.auth.userId]);
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [req.auth.userId]);
  res.json({ ok: true });
}));
