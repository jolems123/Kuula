import test from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("webhook signature verification accepts the Smile ID HMAC and rejects tampering", async () => {
  process.env.SMILE_PARTNER_ID = "8974";
  process.env.SMILE_API_KEY = "test-api-key";
  process.env.PUBLIC_API_BASE_URL = "https://api.example.com";

  const { computeSignature, verifyWebhookSignature, smileIdConfigured } = await import("./smile-id.js");

  const timestamp = new Date().toISOString();
  const good = computeSignature("test-api-key", "8974", timestamp);
  assert.equal(verifyWebhookSignature(timestamp, good), true);

  // A different timestamp or key must never validate.
  assert.equal(verifyWebhookSignature(new Date(Date.now() - 60_000).toISOString(), good), false);
  process.env.SMILE_API_KEY = "another-key";
  assert.equal(verifyWebhookSignature(timestamp, good), false);

  assert.equal(smileIdConfigured(), true);
});

test("smileIdConfigured fails closed without credentials or callback URL", async () => {
  delete process.env.SMILE_PARTNER_ID;
  delete process.env.SMILE_IDENTITY_PARTNER_ID;
  delete process.env.SMILE_API_KEY;
  delete process.env.SMILE_IDENTITY_AUTH_TOKEN;
  delete process.env.PUBLIC_API_BASE_URL;
  delete process.env.PUBLIC_API_URL;
  delete process.env.SMILE_CALLBACK_URL;

  const { smileIdConfigured } = await import("./smile-id.js");
  assert.equal(smileIdConfigured(), false);
});

test("normalizes current and legacy document-verification callbacks", async () => {
  const { normalizeDocumentVerificationWebhook } = await import("./smile-id.js");
  assert.deepEqual(
    normalizeDocumentVerificationWebhook({ status: "attention", partner_params: { job_id: "job-new" } }),
    { jobId: "job-new", status: "attention", message: "Verification attention" },
  );
  assert.deepEqual(
    normalizeDocumentVerificationWebhook({ ResultCode: "0810", ResultText: "Document Verified", PartnerParams: { job_id: "job-classic" } }),
    { jobId: "job-classic", status: "clear", message: "Document Verified" },
  );
  assert.equal(
    normalizeDocumentVerificationWebhook({ ResultCode: "0813", ResultText: "Document verification failed", PartnerParams: { job_id: "failed" } }).status,
    "block",
  );
});

test("given names keep every name before the surname", async () => {
  const { splitName } = await import("./smile-id.js");
  assert.deepEqual(splitName("Amina Fatou Clearwater"), { first: "Amina Fatou", last: "Clearwater" });
  assert.deepEqual(splitName("Nakato"), { first: "Nakato", last: "Nakato" });
});

test("webhooks correlate on Kuula's own reference and fall back to the bound user id", async () => {
  const { normalizeDocumentVerificationWebhook, webhookKuulaUserId } = await import("./smile-id.js");
  const userId = "7c528d8c-a79e-402b-a332-6c962d583c43";
  // Smile ID may report its own generated ids under job_id/user_id.
  const payload = { status: "clear" as const, partner_params: { kuula_reference: "docv-ours", job_id: "job_01m326p53pe1ztjdxh2d9jn9ck", user_id: userId } };
  assert.equal(normalizeDocumentVerificationWebhook(payload).jobId, "docv-ours");
  assert.equal(webhookKuulaUserId(payload), userId);
  assert.equal(webhookKuulaUserId({ partner_params: { user_id: "user_01h8x9y2z3a1b5c6d7e8f9g0h1" } }), "");
});
