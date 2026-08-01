import test from "node:test";
import assert from "node:assert/strict";
import {
  generateOtpCode,
  hashOtp,
  otpExpiry,
  validateNewPassword,
  verifyOtpHash,
} from "./otp.js";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("stores only a keyed purpose-bound OTP hash", () => {
  process.env.NODE_ENV = "test";
  process.env.OTP_PEPPER = "test-pepper-with-more-than-thirty-two-characters";
  const hash = hashOtp("user-1", "phone_verify", "123456");

  assert.notEqual(hash, "123456");
  assert.equal(verifyOtpHash(hash, "user-1", "phone_verify", "123456"), true);
  assert.equal(verifyOtpHash(hash, "user-1", "password_reset", "123456"), false);
  assert.equal(verifyOtpHash(hash, "user-2", "phone_verify", "123456"), false);
  assert.equal(verifyOtpHash(hash, "user-1", "phone_verify", "654321"), false);
});

test("fixed OTP is allowed only in test", () => {
  process.env.NODE_ENV = "test";
  process.env.TEST_OTP_CODE = "246810";
  assert.equal(generateOtpCode(), "246810");

  process.env.NODE_ENV = "production";
  assert.throws(() => generateOtpCode(), /test/i);
});

test("OTP expires ten minutes after issuance", () => {
  const start = new Date("2026-08-01T20:00:00.000Z");
  assert.equal(otpExpiry(start).toISOString(), "2026-08-01T20:10:00.000Z");
});

test("new passwords require length, a letter and a number", () => {
  assert.equal(validateNewPassword("Kuula2026"), "Kuula2026");
  assert.throws(() => validateNewPassword("12345678"), /letter/i);
  assert.throws(() => validateNewPassword("password"), /number/i);
  assert.throws(() => validateNewPassword("Short1"), /8/);
});
