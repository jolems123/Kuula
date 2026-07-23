/**
 * Tests for Uganda NIN validation.
 */
import { describe, it, expect } from "vitest";
import { normalizeNin, isValidUgandaNin, UGANDA_NIN_LENGTH } from "./nin";

describe("normalizeNin", () => {
  it("uppercases and removes whitespace", () => {
    expect(normalizeNin("cm 8602410 e8ewe")).toBe("CM8602410E8EWE");
  });
});

describe("isValidUgandaNin", () => {
  it("accepts a real-shaped 14-char NIN", () => {
    expect(isValidUgandaNin("CM8602410E8EWE")).toBe(true);
  });

  it("accepts lowercase / spaced input by normalizing first", () => {
    expect(isValidUgandaNin("cm8602410e8ewe")).toBe(true);
    expect(isValidUgandaNin(" CM8602410E8EWE ")).toBe(true);
  });

  it("rejects the old 10-12 digit numeric style", () => {
    expect(isValidUgandaNin("1234567890")).toBe(false);
    expect(isValidUgandaNin("CM1234567890")).toBe(false); // only 12 chars
  });

  it("rejects the wrong length", () => {
    expect(isValidUgandaNin("CM8602410E8EW")).toBe(false); // 13
    expect(isValidUgandaNin("CM8602410E8EWEE")).toBe(false); // 15
  });

  it("rejects when the first two characters are not letters", () => {
    expect(isValidUgandaNin("C58602410E8EWE")).toBe(false);
    expect(isValidUgandaNin("128602410E8EWE")).toBe(false);
  });

  it("rejects non-alphanumeric characters", () => {
    expect(isValidUgandaNin("CM8602410-8EWE")).toBe(false);
  });

  it("exposes the canonical length", () => {
    expect(UGANDA_NIN_LENGTH).toBe(14);
  });
});
