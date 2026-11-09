import test from "node:test";
import assert from "node:assert/strict";
import { emailTransport, sendTransactionalEmail } from "./email.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

function clearEmailEnv() {
  for (const name of ["RESEND_API_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "EMAIL_FROM_NAME", "SUPPORT_EMAIL"]) delete process.env[name];
}

test("Resend is preferred when its key is set; SMTP is the fallback", () => {
  clearEmailEnv();
  assert.equal(emailTransport(), null);
  Object.assign(process.env, { SMTP_HOST: "smtp.example", SMTP_USER: "u", SMTP_PASSWORD: "p", EMAIL_FROM: "notifications@kuulapp.com" });
  assert.equal(emailTransport(), "smtp");
  process.env.RESEND_API_KEY = "re_test";
  assert.equal(emailTransport(), "resend");
});

test("sends through Resend's HTTPS API with the configured sender and reply-to", async () => {
  clearEmailEnv();
  Object.assign(process.env, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "notifications@kuulapp.com", SUPPORT_EMAIL: "support@kuulapp.com" });
  let request: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init: init! };
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };
  const result = await sendTransactionalEmail({ to: "admin@kuulapp.com", subject: "Kuula staff verification code", text: "Your code is 123456." });
  assert.deepEqual(result, { accepted: true, detail: "Accepted by Resend (email_123)" });
  assert.equal(request!.url, "https://api.resend.com/emails");
  assert.equal((request!.init.headers as Record<string, string>).Authorization, "Bearer re_test_key");
  const body = JSON.parse(String(request!.init.body));
  assert.deepEqual(body, { from: "Kuula <notifications@kuulapp.com>", to: ["admin@kuulapp.com"], reply_to: "support@kuulapp.com", subject: "Kuula staff verification code", text: "Your code is 123456." });
});

test("a Resend refusal is reported without the key or the message text", async () => {
  clearEmailEnv();
  Object.assign(process.env, { RESEND_API_KEY: "re_secret_value", EMAIL_FROM: "notifications@kuulapp.com" });
  globalThis.fetch = async () => new Response(JSON.stringify({ name: "validation_error", message: "The kuulapp.com domain is not verified." }), { status: 403 });
  const result = await sendTransactionalEmail({ to: "admin@kuulapp.com", subject: "Code", text: "Your code is 654321." });
  assert.equal(result.accepted, false);
  assert.match(result.detail, /HTTP 403 validation_error: The kuulapp.com domain is not verified/);
  assert.doesNotMatch(result.detail, /re_secret_value|654321/);
});
