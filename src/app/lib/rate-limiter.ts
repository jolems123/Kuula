/**
 * Simple client-side rate limiter for sensitive operations like admin login.
 *
 * Uses a sliding-window counter: tracks the timestamp of each attempt and
 * allows at most `maxAttempts` within `windowMs` milliseconds. After the
 * limit is hit, the user must wait until the oldest attempt expires.
 *
 * This is a CLIENT-SIDE defense only — it reduces accidental hammering and
 * provides immediate UX feedback. Server-side rate limiting (e.g. Supabase
 * Edge Function middleware, Cloudflare) is still required for real protection.
 */
export interface RateLimiterResult {
  allowed: boolean;
  retryAfterMs: number; // 0 if allowed, > 0 = wait this many ms before next attempt
  attemptCount: number;
}

export class RateLimiter {
  private attempts: number[] = [];
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number, windowMs: number) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  /** Check if an action is allowed. If allowed, records the attempt. */
  check(): RateLimiterResult {
    const now = Date.now();
    // Prune attempts outside the window
    this.attempts = this.attempts.filter((t) => now - t < this.windowMs);

    if (this.attempts.length >= this.maxAttempts) {
      const oldest = this.attempts[0];
      const retryAfterMs = this.windowMs - (now - oldest);
      return { allowed: false, retryAfterMs, attemptCount: this.attempts.length };
    }

    this.attempts.push(now);
    return { allowed: true, retryAfterMs: 0, attemptCount: this.attempts.length };
  }

  /** Reset the limiter (e.g. after a successful login). */
  reset(): void {
    this.attempts = [];
  }

  /** Get the number of remaining attempts in the current window. */
  get remaining(): number {
    const now = Date.now();
    this.attempts = this.attempts.filter((t) => now - t < this.windowMs);
    return Math.max(0, this.maxAttempts - this.attempts.length);
  }
}

// ── Singleton instances ─────────────────────────────────────────────────────

/** Admin login: 5 attempts per 5 minutes. */
export const adminLoginLimiter = new RateLimiter(5, 5 * 60 * 1000);

/** Customer login: 10 attempts per 5 minutes. */
export const customerLoginLimiter = new RateLimiter(10, 5 * 60 * 1000);

/** OTP verification: 8 attempts per 5 minutes. */
export const otpLimiter = new RateLimiter(8, 5 * 60 * 1000);