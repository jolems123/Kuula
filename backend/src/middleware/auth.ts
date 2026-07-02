/**
 * Auth middleware. Validates the access JWT, loads the user, and attaches both
 * to `req.auth`. Use `requireAuth` on any route that needs a signed-in user,
 * `requireAdmin` on staff-only routes, and `requireRole("user")` to restrict
 * to customers.
 */
import type { Request, RequestHandler } from "express";
import { verifyAccessToken } from "../lib/tokens.js";
import { ApiError } from "../lib/errors.js";
import { query } from "../db/client.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: "user" | "admin";
        user?: {
          id: string;
          role: "user" | "admin";
          fullName: string;
          phone: string;
          email: string | null;
        };
      };
    }
  }
}

export interface AuthPayload {
  sub: string;
  role: "user" | "admin";
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}

/** Require a valid access token; attach `req.auth`. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) throw new ApiError(401, "Missing Authorization header");
    const claims = verifyAccessToken(token);

    // Load the user row to make sure they still exist + aren't soft-deleted.
    const { rows } = await query<{ id: string; role: "user" | "admin"; full_name: string; phone: string; email: string | null; deleted_at: string | null }>(
      `SELECT id, role, full_name, phone, email, deleted_at FROM users WHERE id = $1`,
      [claims.sub],
    );
    if (!rows[0] || rows[0].deleted_at) throw new ApiError(401, "Account no longer available");

    req.auth = {
      userId: rows[0].id,
      role: rows[0].role,
      user: {
        id: rows[0].id,
        role: rows[0].role,
        fullName: rows[0].full_name,
        phone: rows[0].phone,
        email: rows[0].email,
      },
    };
    next();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return next(err);
    if (err instanceof Error && err.name === "TokenExpiredError") {
      return next(new ApiError(401, "Access token expired"));
    }
    next(new ApiError(401, "Invalid or expired token"));
  }
};

/** Require an admin (staff) auth context. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new ApiError(401, "Authentication required"));
  if (req.auth.role !== "admin") return next(new ApiError(403, "Staff access only"));
  next();
};

/** Require a specific role. */
export function requireRole(role: "user" | "admin"): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new ApiError(401, "Authentication required"));
    if (req.auth.role !== role) return next(new ApiError(403, `This action requires ${role} access`));
    next();
  };
}

/** Optional auth: attach `req.auth` if a valid token is present, but don't 401. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) return next();
    const claims = verifyAccessToken(token);
    req.auth = { userId: claims.sub, role: claims.role };
  } catch {
    // Ignore — this is optional.
  }
  next();
};

/** Legacy helper used by route handlers that just want the decoded payload. */
export function decodeAuth(req: Request): AuthPayload | null {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}
