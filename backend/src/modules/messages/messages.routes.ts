/**
 * Messages module: customer ↔ admin support chat.
 */
import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { nextMessageId } from "../../lib/ids.js";
import { serializeMessage } from "../../lib/serialize.js";

export const messagesRouter = Router();

messagesRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query(
    `SELECT id, sender_id, receiver_id, content, is_read, created_at FROM messages
     WHERE sender_id = $1 OR receiver_id = $1
     ORDER BY created_at ASC`,
    [req.auth.userId],
  );
  res.json({ messages: rows.map((r: any) => serializeMessage(r)) });
}));

const postSchema = z.object({
  content: z.string().min(1).max(4000),
  receiverId: z.string().optional(),
});

messagesRouter.post("/", requireAuth, validate({ body: postSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { content, receiverId } = req.body as z.infer<typeof postSchema>;

  // Customers can only message support (the admin). Admins pick the user.
  let to: string;
  if (req.auth.role === "admin") {
    if (!receiverId) throw new ApiError(400, "Missing recipient");
    to = receiverId;
  } else {
    const { rows: adminRows } = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`);
    if (!adminRows[0]) throw new ApiError(404, "No admin available");
    to = adminRows[0].id;
  }

  const id = nextMessageId();
  await query(
    `INSERT INTO messages (id, sender_id, receiver_id, content, is_read, created_at) VALUES ($1, $2, $3, $4, FALSE, NOW())`,
    [id, req.auth.userId, to, content.trim().slice(0, 4000)],
  );
  const { rows } = await query(`SELECT * FROM messages WHERE id = $1`, [id]);
  res.status(201).json({ message: serializeMessage(rows[0] as any) });
}));

messagesRouter.post("/read", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  await query(`UPDATE messages SET is_read = TRUE WHERE receiver_id = $1`, [req.auth.userId]);
  res.json({ ok: true });
}));
