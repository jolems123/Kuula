/**
 * JWT sign/verify using jsonwebtoken. Issues:
 *   - access token (short TTL, in-memory on the client)
 *   - refresh token (long TTL, stored hashed server-side, rotated on each use)
 *
 * The frontend sends `Authorization: Bearer <access>`. When access expires, it
 * hits POST /api/auth/refresh with the refresh token in the request body and
 * gets a new pair back.
 */
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createHash } from "node:crypto";
import { config } from "../config.js";

export interface AccessClaims extends JwtPayload {
  sub: string;       // user ID
  role: "user" | "admin";
  type: "access";
}

export interface RefreshClaims extends JwtPayload {
  sub: string;
  jti: string;       // refresh token ID (refresh_tokens.id)
  type: "refresh";
}

/** Convert human-readable TTL strings ("15m", "30d") to seconds for jsonwebtoken. */
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) return 900;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
}

export function signAccessToken(sub: string, role: "user" | "admin"): string {
  return jwt.sign({ sub, role, type: "access" }, config.auth.jwtSecret, {
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    expiresIn: ttlToSeconds(config.auth.accessTtl),
  });
}

export function signRefreshToken(sub: string, jti: string): string {
  return jwt.sign({ sub, jti, type: "refresh" }, config.auth.jwtSecret, {
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    expiresIn: ttlToSeconds(config.auth.refreshTtl),
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, config.auth.jwtSecret, {
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  }) as AccessClaims;
  if (payload.type !== "access") throw new Error("not an access token");
  return payload;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const payload = jwt.verify(token, config.auth.jwtSecret, {
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  }) as RefreshClaims;
  if (payload.type !== "refresh") throw new Error("not a refresh token");
  return payload;
}

/** SHA-256 of the refresh JWT — what we store in refresh_tokens.token_hash. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
