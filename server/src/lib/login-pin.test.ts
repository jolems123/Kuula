import test from "node:test";
import assert from "node:assert/strict";
import { validateNewPin } from "./otp.js";

test("login PIN must be six digits and not trivially guessable", () => {
  assert.equal(validateNewPin("482915"), "482915");
  assert.equal(validateNewPin(" 739104 "), "739104");
  for (const weak of ["12345", "1234567", "abcdef", "111111", "123456", "654321", "890123", ""]) {
    assert.throws(() => validateNewPin(weak), RangeError, weak);
  }
});
