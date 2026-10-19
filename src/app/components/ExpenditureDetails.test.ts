import { describe, it, expect } from "vitest";
import { expenditureError } from "./ExpenditureDetails";
describe("optional itemized expenditure", () => {
  const funds = { stock: 100, equipment: 0, operations: 50, expansion: 0, other: 0 };
  it("allows omitted details and reconciles mixed spending", () => {
    expect(expenditureError([], funds)).toBe("");
    expect(expenditureError([{ category: "stock", description: "Stock", amount: 100 }, { category: "operations", description: "Rent", amount: 50 }], funds)).toBe("");
  });
  it("rejects misplaced, incomplete, fractional and negative expenditure", () => {
    for (const amount of [150, 0, -1, 100.5]) expect(expenditureError([{ category: "stock", description: "Stock", amount }], funds)).not.toBe("");
    expect(expenditureError([{ category: "stock", description: " ", amount: 100 }], funds)).not.toBe("");
  });
});
