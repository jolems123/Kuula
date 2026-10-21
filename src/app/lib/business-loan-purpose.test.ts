import { describe, expect, it } from "vitest";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurpose, parseBusinessLoanPurpose, formatBusinessLoanPurposes, parseBusinessLoanPurposes } from "./business-loan-purpose";

describe("business loan purpose formatting", () => {
  it("round trips multiple purposes and preserves separators inside Other descriptions", () => {
    const result = formatBusinessLoanPurposes(["Stock and inventory", "Other", "Working capital"], "Buy supplies; pay rent");
    expect(parseBusinessLoanPurposes(result)).toEqual({ options: ["Stock and inventory", "Working capital", "Other"], otherDetails: "Buy supplies; pay rent" });
    expect(parseBusinessLoanPurposes("Business: Inventory and stock")?.options).toEqual(["Stock and inventory"]);
    expect(parseBusinessLoanPurposes("Business: Working capital; Working capital")).toBeNull();
    expect(parseBusinessLoanPurposes("Business: Stock and inventory; Personal")).toBeNull();
  });
  it("offers twelve purposes and reads previous category names", () => {
    expect(BUSINESS_LOAN_PURPOSES).toHaveLength(12);
    expect(parseBusinessLoanPurpose("Business: Inventory and stock")?.option).toBe("Stock and inventory");
    expect(parseBusinessLoanPurpose("Business: Equipment and tools")?.option).toBe("Equipment, tools and machinery");
  });
  it("round-trips standard business purposes", () => {
    for (const option of BUSINESS_LOAN_PURPOSES) {
      if (option === "Other") continue;
      const formatted = formatBusinessLoanPurpose(option);
      expect(parseBusinessLoanPurpose(formatted)).toEqual({ option, otherDetails: "" });
    }
  });

  it("preserves trimmed custom Other details", () => {
    const formatted = formatBusinessLoanPurpose("Other", "  Add a second oven  ");
    expect(formatted).toBe("Business: Other - Add a second oven");
    expect(parseBusinessLoanPurpose(formatted)).toEqual({ option: "Other", otherDetails: "Add a second oven" });
  });

  it("does not interpret legacy non-business purposes", () => {
    expect(parseBusinessLoanPurpose("School Fees")).toBeNull();
    expect(parseBusinessLoanPurpose("Business: Other")).toBeNull();
  });
});
