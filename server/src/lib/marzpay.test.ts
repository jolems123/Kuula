import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarzPayWebhookUrl,
  collectMoney,
  createPaymentReference,
  getMarzPayTransaction,
  normalizeMarzPayAmount,
  normalizeUgandaMobileMoneyPhone,
  parseMarzPayWebhook,
  secureTokenEquals,
  sendMoney,
  verifyMarzPayFinalEvent,
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

test("builds a callback URL without embedding credentials and requires HTTPS in production", () => {
  process.env.PUBLIC_API_URL = "https://api.kuula.ug/";
  process.env.NODE_ENV = "production";
  process.env.REAL_MONEY_ENABLED = "true";
  assert.equal(buildMarzPayWebhookUrl(), "https://api.kuula.ug/api/payments/marzpay/webhook");

  process.env.PUBLIC_API_URL = "http://api.kuula.ug";
  assert.throws(() => buildMarzPayWebhookUrl(), /HTTPS/);
});

test("sends current send-money and collect-money requests", async () => {
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.MARZPAY_BASE_URL = "https://wallet.example/api/v1";
  process.env.NODE_ENV = "test";

  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(String(input));
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Basic a2V5OnNlY3JldA==");
    const body = init?.body as FormData;
    assert.equal(body.get("phone_number"), "+256770123456");
    assert.equal(body.get("amount"), "1000");
    assert.equal(body.get("country"), "UG");
    assert.equal(body.get("callback_url"), "https://api.kuula.ug/api/payments/marzpay/webhook");

    return new Response(JSON.stringify({
      status: "success",
      message: "initiated",
      data: {
        transaction: {
          uuid: "4e7fb3fa-c13a-4b05-8acd-cf60ff68cb94",
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
    callbackUrl: "https://api.kuula.ug/api/payments/marzpay/webhook",
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

test("independently verifies final callbacks against authenticated provider transaction details", async () => {
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.MARZPAY_BASE_URL = "https://wallet.example/api/v1";
  process.env.NODE_ENV = "test";
  const uuid = "4e7fb3fa-c13a-4b05-8acd-cf60ff68cb94";
  const reference = "c97fae8b-9b7f-4192-9f72-6f0859d33e67";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), `https://wallet.example/api/v1/transactions/${uuid}`);
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Basic a2V5OnNlY3JldA==");
    return new Response(JSON.stringify({
      event_type: "collection.completed",
      transaction: { uuid, reference, status: "completed", amount: { raw: 2500, currency: "UGX" } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const callback = parseMarzPayWebhook({
    event_type: "collection.completed",
    transaction: { uuid, reference, status: "completed", amount: { raw: 2500 } },
  });
  const trusted = await verifyMarzPayFinalEvent({ callback, expectedUuid: uuid, expectedReference: reference, expectedAmount: 2500 });
  assert.equal(trusted.isSuccess, true);
  assert.equal(trusted.amount, 2500);

  const fetched = await getMarzPayTransaction(uuid);
  assert.equal(fetched.reference, reference);
});

test("rejects a final callback whose provider UUID does not match initiation", async () => {
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.NODE_ENV = "test";
  const callback = parseMarzPayWebhook({
    event_type: "collection.completed",
    transaction: {
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reference: "c97fae8b-9b7f-4192-9f72-6f0859d33e67",
      status: "completed",
      amount: { raw: 2500 },
    },
  });
  await assert.rejects(
    () => verifyMarzPayFinalEvent({
      callback,
      expectedUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedReference: callback.reference,
      expectedAmount: 2500,
    }),
    /UUID/
  );
});

test("compares webhook tokens in constant time", () => {
  assert.equal(secureTokenEquals("same-secret", "same-secret"), true);
  assert.equal(secureTokenEquals("wrong", "same-secret"), false);
  assert.equal(secureTokenEquals("", ""), false);
});
