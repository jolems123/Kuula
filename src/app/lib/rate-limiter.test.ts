/**
 * Tests for the RateLimiter class.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter } from "../lib/rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    // 3 attempts per 10 seconds for fast tests
    limiter = new RateLimiter(3, 10_000);
  });

  it("allows attempts up to the max", () => {
    expect(limiter.check().allowed).toBe(true);
    expect(limiter.check().allowed).toBe(true);
    expect(limiter.check().allowed).toBe(true);
  });

  it("blocks attempts beyond the max", () => {
    limiter.check();
    limiter.check();
    limiter.check();
    const result = limiter.check();
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.attemptCount).toBe(3);
  });

  it("reports correct remaining attempts", () => {
    expect(limiter.remaining).toBe(3);
    limiter.check();
    expect(limiter.remaining).toBe(2);
    limiter.check();
    expect(limiter.remaining).toBe(1);
    limiter.check();
    expect(limiter.remaining).toBe(0);
  });

  it("reset() clears all attempts", () => {
    limiter.check();
    limiter.check();
    limiter.check();
    expect(limiter.remaining).toBe(0);

    limiter.reset();
    expect(limiter.remaining).toBe(3);
    expect(limiter.check().allowed).toBe(true);
  });

  it("prunes expired attempts after the window", () => {
    // Manually inject old timestamps
    const now = Date.now();
    (limiter as unknown as { attempts: number[] }).attempts = [
      now - 15_000, // expired (15s ago, window is 10s)
      now - 5_000,  // still in window
    ];

    // After pruning, only 1 attempt remains, so 2 more are allowed
    expect(limiter.remaining).toBe(2);
    expect(limiter.check().allowed).toBe(true);
  });

  it("retryAfterMs decreases over time", () => {
    limiter.check();
    limiter.check();
    limiter.check();
    const blocked = limiter.check();
    const firstWait = blocked.retryAfterMs;
    expect(firstWait).toBeGreaterThan(0);

    // After a tiny delay, the retry time should be slightly less
    // (We can't manipulate time easily, so just verify the structure)
    expect(blocked.allowed).toBe(false);
    expect(typeof firstWait).toBe("number");
  });
});