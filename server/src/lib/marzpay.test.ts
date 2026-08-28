import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildMarzPayWebhookUrl,
  collectMoney,
  createPaymentReference,
  marzPayBaseUrl,
  normalizeMarzPayAmount,
  normalizeUgandaMobileMoneyPhone,
  parseMarzPayWebhook,
  secureTokenEquals,
  sendMoney,
  verifyMarzPayWebhookSignature,
} from "./marzpay.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("normalizes Uganda mobile-money phone formats", () => {
  assert.equal(normalizeUgandaMobileMoneyPhone("0770 123 456"), "+256770123456");
  assert.equal(normalizeUgandaMobileMoneyPhone("256770123456"), "+256770123456");
  assert.equal(normalizeUgandaMobileMoneyPhone("770123456"), "+256770123456");
  assert.throws(() => normalizeUgandaMobileMoneyPhone("0414123456"), RangeError);
});

test("enforces MarZPay transaction limits", () => {
  assert.equal(normalizeMarzPayAmount(500.4), 500);
  assert.equal(normalizeMarzPayAmount(10_000_000), 10_000_000);
  assert.throws(() => normalizeMarzPayAmount(499), RangeError);
  assert.throws(() => normalizeMarzPayAmount(10_000_001), RangeError);
});

test("creates valid unique UUID v4 references", () => {
  const first = createPaymentReference();
  const second = createPaymentReference();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second);
});

test("builds the callback URL only when real money is enabled and requires HTTPS in production", () => {
  process.env.PUBLIC_API_URL = "https://api.kuula.ug/";
  process.env.NODE_ENV = "production";
  process.env.REAL_MONEY_ENABLED = "true";
  assert.equal(
    buildMarzPayWebhookUrl(),
    "https://api.kuula.ug/api/payments/marzpay/webhook"
  );

  process.env.PUBLIC_API_URL = "http://api.kuula.ug";
  assert.throws(() => buildMarzPayWebhookUrl(), /HTTPS/);

  process.env.PUBLIC_API_URL = "https://api.kuula.ug";
  process.env.REAL_MONEY_ENABLED = "false";
  assert.throws(() => buildMarzPayWebhookUrl(), /disabled/);
});

test("sends current send-money and collect-money requests", async () => {
  process.env.NODE_ENV = "test";
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.MARZPAY_BASE_URL = "https://wallet.example/api/v1";

  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(String(input));
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Basic a2V5OnNlY3JldA==");
    const body = init?.body as FormData;
    assert.equal(body.get("phone_number"), "+256770123456");
    assert.equal(body.get("amount"), "1000");
    assert.equal(body.get("country"), "UG");
    assert.equal(body.get("callback_url"), "https://api.kuula.ug/api/payments/marzpay/webhook?token=x");

    return new Response(JSON.stringify({
      status: "success",
      message: "initiated",
      data: {
        transaction: {
          uuid: "provider-uuid",
          reference: body.get("reference"),
          status: "processing",
          provider_reference: "provider-ref",
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const common = {
    phone: "+256770123456",
    amount: 1000,
    reference: createPaymentReference(),
    description: "Kuula test",
    callbackUrl: "https://api.kuula.ug/api/payments/marzpay/webhook?token=x",
  };

  const disbursement = await sendMoney(common);
  const collection = await collectMoney({ ...common, reference: createPaymentReference() });

  assert.equal(disbursement.accepted, true);
  assert.equal(collection.accepted, true);
  assert.deepEqual(paths, [
    "https://wallet.example/api/v1/send-money",
    "https://wallet.example/api/v1/collect-money",
  ]);
});

test("rejects an unapproved MarZPay endpoint in production", () => {
  process.env.NODE_ENV = "production";
  process.env.REAL_MONEY_ENABLED = "true";
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.MARZPAY_BASE_URL = "https://attacker.example/api/v1";
  assert.throws(() => marzPayBaseUrl(), /approved production endpoint/);
});

test("parses final and pending webhook payloads", () => {
  const completed = parseMarzPayWebhook({
    event_type: "collection.completed",
    transaction: {
      uuid: "provider-1",
      reference: "reference-1",
      status: "completed",
      amount: { raw: 2500 },
    },
  });
  assert.equal(completed.reference, "reference-1");
  assert.equal(completed.amount, 2500);
  assert.equal(completed.isSuccess, true);
  assert.equal(completed.isFinal, true);

  const pending = parseMarzPayWebhook({
    event_type: "disbursement.pending",
    transaction: { reference: "reference-2", status: "processing" },
  });
  assert.equal(pending.isFinal, false);
  assert.equal(pending.status, "processing");
});

test("compares webhook tokens in constant time", () => {
  assert.equal(secureTokenEquals("same-secret", "same-secret"), true);
  assert.equal(secureTokenEquals("wrong", "same-secret"), false);
  assert.equal(secureTokenEquals("", ""), false);
});

test("verifies the current MarzPay signed webhook format", () => {
  const rawBody = Buffer.from('{"event_type":"collection.completed"}');
  const timestamp = "1787839200";
  const secret = "signing-secret";
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  assert.equal(verifyMarzPayWebhookSignature({
    rawBody,
    timestamp,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    secret,
    nowMs: Number(timestamp) * 1000,
  }), true);
  assert.equal(verifyMarzPayWebhookSignature({
    rawBody,
    timestamp,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    secret,
    nowMs: Number(timestamp) * 1000 + 301_000,
  }), false);
});
