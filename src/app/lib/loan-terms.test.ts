import { describe, expect, it } from "vitest";
import { getLoanTermOptions, GOOGLE_PLAY_MIN_TERM_DAYS } from "./loan-terms";

describe("loan term options", () => {
  it("offers 30, 45, 60 days followed by the existing terms on web", () => {
    expect(getLoanTermOptions("web")).toEqual([30, 45, 60, 90, 120, 180, 365]);
  });

  it("keeps Android loan terms at or above its configured minimum", () => {
    const androidTerms = getLoanTermOptions("android");
    expect(androidTerms).toEqual([61, 90, 120, 180, 365]);
    expect(androidTerms.every((days) => days >= GOOGLE_PLAY_MIN_TERM_DAYS)).toBe(true);
  });
});
