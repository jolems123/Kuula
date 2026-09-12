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
