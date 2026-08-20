import test from "node:test";
import assert from "node:assert/strict";
import { classifyRepaymentReminder } from "./repayment-reminders.js";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const hours = (value: number) => new Date(NOW.getTime() + value * 60 * 60 * 1000);

test("classifies seven-day reminder window", () => {
  assert.equal(classifyRepaymentReminder(hours(7 * 24), NOW), "due_7d");
  assert.equal(classifyRepaymentReminder(hours(7 * 24 + 1), NOW), null);
});

test("classifies three-day and one-day reminder windows", () => {
  assert.equal(classifyRepaymentReminder(hours(72), NOW), "due_3d");
  assert.equal(classifyRepaymentReminder(hours(24), NOW), "due_1d");
});

test("classifies overdue repayments", () => {
  assert.equal(classifyRepaymentReminder(hours(-1), NOW), "overdue");
});
