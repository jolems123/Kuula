import test from "node:test";
import assert from "node:assert/strict";
import { sendOtpSms, smsConfigured } from "./sms.js";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("test provider is available only in test", async () => {
  process.env.NODE_ENV = "test";
  process.env.SMS_PROVIDER = "test";
  assert.equal(smsConfigured(), true);

  const result = await sendOtpSms("+256770123456", "123456", "phone_verify");
  assert.equal(result.accepted, true);
  assert.equal(result.provider, "test");

  process.env.NODE_ENV = "production";
  assert.equal(smsConfigured(), false);
});

test("missing production SMS configuration fails closed", async () => {
  process.env.NODE_ENV = "production";
  process.env.SMS_PROVIDER = "";
  await assert.rejects(
    () => sendOtpSms("+256770123456", "123456", "password_reset"),
    /SMS_PROVIDER/
  );
});
