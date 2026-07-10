/**
 * Tests for the selection state module.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setSelectedTransaction,
  getSelectedTransaction,
  setLastPayment,
  getLastPayment,
  clearSelectionState,
} from "../lib/selection";

describe("selection state", () => {
  beforeEach(() => {
    clearSelectionState();
  });

  it("starts null", () => {
    expect(getSelectedTransaction()).toBeNull();
    expect(getLastPayment()).toBeNull();
  });

  it("stores and retrieves a selected transaction", () => {
    const txn = { id: "t1", type: "disbursement", amount: 500000, status: "completed", reference: "REF-001", createdAt: "2026-07-10" };
    setSelectedTransaction(txn);
    expect(getSelectedTransaction()).toEqual(txn);
  });

  it("stores and retrieves a last payment", () => {
    const payment = { amount: 50000, reference: "PAY-001", method: "mtn-momo", status: "completed", dateISO: "2026-07-10" };
    setLastPayment(payment);
    expect(getLastPayment()).toEqual(payment);
  });

  it("clearSelectionState resets both to null", () => {
    setSelectedTransaction({ id: "t1", type: "disbursement", amount: 500000, status: "completed", reference: "REF-001", createdAt: "2026-07-10" });
    setLastPayment({ amount: 50000, reference: "PAY-001", method: "mtn-momo", status: "completed", dateISO: "2026-07-10" });

    clearSelectionState();

    expect(getSelectedTransaction()).toBeNull();
    expect(getLastPayment()).toBeNull();
  });

  it("overwrites previous value", () => {
    setSelectedTransaction({ id: "t1", type: "disbursement", amount: 500000, status: "completed", reference: "REF-001", createdAt: "2026-07-10" });
    const txn2 = { id: "t2", type: "repayment", amount: 30000, status: "pending", reference: "REF-002", createdAt: "2026-07-11" };
    setSelectedTransaction(txn2);
    expect(getSelectedTransaction()?.id).toBe("t2");
  });
});