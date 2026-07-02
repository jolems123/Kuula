/**
 * Rate limiters. Two policies:
 *   - generalLimiter: 300 req / 15 min per IP, applied globally
 *   - authLimiter:    10 req / 15 min per IP, applied to /api/auth/* routes
 *
 * Backed by in-memory store by default; for multi-instance prod deploy, swap
 * `store` for `rate-limit-redis` and pass a Redis client.
 */
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import { config } from "../config.js";
import { logger } from "./logger.js";

export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down.", code: "rate_limited" },
  skip: () => config.isTest,
});

export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later.", code: "auth_rate_limited" },
  skip: () => config.isTest,
});

/** Slows responses (not blocks) after 5 auth attempts in a window. */
export const authSlowDown = slowDown({
  windowMs: config.rateLimit.windowMs,
  delayAfter: 5,
  delayMs: (hits) => (hits - 5) * 500,
  maxDelayMs: 5000,
  skip: () => config.isTest,
  validate: { delayMs: false },
});

/** Soft limiter for write operations (loan apply, savings deposit, etc.). */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests, please slow down.", code: "write_rate_limited" },
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    logger.warn("write rate limit hit");
    next(new Error("write_rate_limited"));
  },
});
