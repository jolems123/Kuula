import { describe, expect, it } from "vitest";
import { toUgandaPhone } from "./phone";

describe("toUgandaPhone", () => {
  it.each([
    ["700000099", "+256700000099"],
    ["0700000099", "+256700000099"],
    ["256700000099", "+256700000099"],
    ["+256 700 000 099", "+256700000099"],
    ["0700-000-099", "+256700000099"],
  ])("normalises %s", (input, expected) => {
    expect(toUgandaPhone(input)).toBe(expected);
  });

  it("returns an empty string when nothing was typed", () => {
    expect(toUgandaPhone("")).toBe("");
    expect(toUgandaPhone("  ")).toBe("");
  });
});
