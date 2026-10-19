import { describe, expect, it } from "vitest";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurpose, parseBusinessLoanPurpose } from "./business-loan-purpose";

describe("business loan purpose formatting", () => {
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
