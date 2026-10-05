import test from "node:test";
import assert from "node:assert/strict";
import { validateNewPin } from "./otp.js";

test("login PIN must be four digits and not trivially guessable", () => {
  assert.equal(validateNewPin("4829"), "4829");
  assert.equal(validateNewPin(" 7391 "), "7391");
  for (const weak of ["123", "12345", "482915", "abcd", "1111", "1234", "4321", "8901", ""]) {
    assert.throws(() => validateNewPin(weak), RangeError, weak);
  }
});
