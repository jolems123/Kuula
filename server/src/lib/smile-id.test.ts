import assert from "node:assert/strict";
import test from "node:test";
import { verifyNinWithSmileId } from "./smile-id.js";

test("Uganda Basic KYC uses Smile ID v2 and the required card number", async () => {
  const previous = {
    partnerId: process.env.SMILE_PARTNER_ID,
    apiKey: process.env.SMILE_API_KEY,
    environment: process.env.SMILE_ENV,
    fetch: globalThis.fetch,
  };
  process.env.SMILE_PARTNER_ID = "test-partner";
  process.env.SMILE_API_KEY = "test-api-key";
  process.env.SMILE_ENV = "sandbox";

  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      ResultCode: "1020",
      ResultText: "Exact Match",
      SmileJobID: "smile-job-1",
      Actions: { Verify_ID_Number: "Verified" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await verifyNinWithSmileId({
      nationalId: "CM8602410E8EWE",
      secondaryIdNumber: "123456789",
      fullName: "Amina Nakato",
      dob: "1990-01-01",
      userId: "user-1",
    });
    assert.equal(requestUrl, "https://testapi.smileidentity.com/v2/verify");
    assert.equal(requestBody.id_type, "NATIONAL_ID_NO_PHOTO");
    assert.equal(requestBody.secondary_id_number, "123456789");
    assert.equal(requestBody.source_sdk, "rest_api");
    assert.equal(result.verified, true);
    assert.equal(result.reference, "smile-job-1");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.partnerId === undefined) delete process.env.SMILE_PARTNER_ID;
    else process.env.SMILE_PARTNER_ID = previous.partnerId;
    if (previous.apiKey === undefined) delete process.env.SMILE_API_KEY;
    else process.env.SMILE_API_KEY = previous.apiKey;
    if (previous.environment === undefined) delete process.env.SMILE_ENV;
    else process.env.SMILE_ENV = previous.environment;
  }
});
