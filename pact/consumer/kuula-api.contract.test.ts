import path from "node:path";
import { describe, expect, it } from "vitest";
import { Matchers, Pact, SpecificationVersion } from "@pact-foundation/pact";

const { boolean, integer, like, string } = Matchers;

const pact = new Pact({
  consumer: "KuulaWebMobile",
  provider: "KuulaNodeApi",
  dir: path.resolve(process.cwd(), "pacts"),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}

const application = {
  id: "33333333-3333-4333-8333-333333333333",
  applicantId: "11111111-1111-4111-8111-111111111111",
  applicantName: "Kuula Test",
  amount: 100000,
  purpose: "Working capital",
  termDays: 90,
  channel: "MTN MoMo",
  status: "disbursing",
  total: 106000,
  apr: 0.24,
  interest: 6000,
  createdAt: "2026-08-23T10:00:00.000Z",
  decidedAt: "2026-08-23T10:05:00.000Z",
  decisionNotes: "Approved",
  offerExpiresAt: "2026-08-24T10:05:00.000Z",
  underwritingStatus: "approved",
};

describe("Kuula frontend -> Node API contracts", () => {
  it("keeps the liveness response compatible with the frontend", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a frontend liveness check")
      .withRequest("GET", "/api/health")
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          ok: boolean(true),
          timestamp: string("2026-08-23T10:00:00.000Z"),
          version: string("2.4.1"),
          realMoneyEnabled: boolean(false),
        });
      })
      .executeTest(async (mockServer) => {
        const response = await json<{ ok: boolean; realMoneyEnabled?: boolean }>(`${mockServer.url}/api/health`);
        expect(response.ok).toBe(true);
        expect(response.realMoneyEnabled).toBe(false);
      });
  });

  it("keeps customer login/session fields compatible", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer login")
      .withRequest("POST", "/api/auth/login", (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({ phone: "+256700000000", pin: "12345678" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          token: string("access-token"),
          refreshToken: string("refresh-token"),
          accessExpiresInSeconds: integer(900),
          role: string("customer"),
          user: like({
            id: "11111111-1111-4111-8111-111111111111",
            role: "customer",
            initials: "KT",
            fullName: "Kuula Test",
            phone: "+256700000000",
            email: "customer@kuula.test",
            nationalId: "CM000000000000",
            dateOfBirth: "1990-01-01",
            district: "Kampala",
            occupation: "Trader",
            memberSince: "2026-08-23T10:00:00.000Z",
            verified: true,
            avatarUrl: null,
          }),
          credit: null,
          loan: null,
          messages: [],
          unreadNotifications: integer(0),
        });
      })
      .executeTest(async (mockServer) => {
        const session = await json<{ token: string; refreshToken: string; role: string; unreadNotifications: number }>(
          `${mockServer.url}/api/auth/login`,
          { method: "POST", body: JSON.stringify({ phone: "+256700000000", pin: "12345678" }) },
        );
        expect(session.token).toBeTruthy();
        expect(session.refreshToken).toBeTruthy();
        expect(session.role).toBe("customer");
        expect(session.unreadNotifications).toBe(0);
      });
  });

  it("keeps loan quote money fields numeric and server-authoritative", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer loan quote request")
      .withRequest("POST", "/api/loans/quote", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
        builder.jsonBody({ amount: 100000, termDays: 90 });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          principal: integer(100000),
          termDays: integer(90),
          apr: like(0.24),
          aprPercent: like(24),
          monthlyRatePercent: like(2),
          interest: integer(6000),
          fee: integer(0),
          total: integer(106000),
          compound: boolean(false),
        });
      })
      .executeTest(async (mockServer) => {
        const quote = await json<{ principal: number; total: number; compound: boolean }>(
          `${mockServer.url}/api/loans/quote`,
          { method: "POST", headers: { Authorization: "Bearer contract-token" }, body: JSON.stringify({ amount: 100000, termDays: 90 }) },
        );
        expect(quote.total).toBeGreaterThanOrEqual(quote.principal);
        expect(quote.compound).toBe(false);
      });
  });

  it("keeps agreement acceptance idempotent with the same receipt fields", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an already-accepted loan agreement")
      .withRequest("POST", "/api/loans/33333333-3333-4333-8333-333333333333/agreement/accept", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
        builder.jsonBody({ clientContext: { source: "mobile" } });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          ok: boolean(true),
          acceptedAt: string("2026-08-23T10:10:00.000Z"),
          agreementVersion: string("2026-08-01"),
          agreementHash: string("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
        });
      })
      .executeTest(async (mockServer) => {
        const result = await json<{ ok: boolean; agreementHash: string }>(
          `${mockServer.url}/api/loans/33333333-3333-4333-8333-333333333333/agreement/accept`,
          { method: "POST", headers: { Authorization: "Bearer contract-token" }, body: JSON.stringify({ clientContext: { source: "mobile" } }) },
        );
        expect(result.ok).toBe(true);
        expect(result.agreementHash).toHaveLength(64);
      });
  });

  it("keeps disbursement acceptance application shape stable", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer accepts an offered loan for disbursement")
      .withRequest("POST", "/api/loans/33333333-3333-4333-8333-333333333333/accept", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          application: like(application),
          disbursement: like({
            id: "44444444-4444-4444-8444-444444444444",
            status: "pending",
            beneficiaryType: "customer",
            network: "mtn",
            currency: "UGX",
            approvedAmount: 100000,
            totalSettled: 0,
            remainingAmount: 100000,
            reference: "KUULA-DISB-001",
            legs: [{ id: "55555555-5555-4555-8555-555555555555", sequence: 1, amount: 100000, status: "pending", reference: "KUULA-DISB-001" }],
          }),
          message: string("Disbursement started in 1 provider-safe transaction."),
        });
      })
      .executeTest(async (mockServer) => {
        const result = await json<{ application: typeof application; disbursement: { reference: string } }>(
          `${mockServer.url}/api/loans/33333333-3333-4333-8333-333333333333/accept`,
          { method: "POST", headers: { Authorization: "Bearer contract-token" } },
        );
        expect(result.application.amount).toBe(100000);
        expect(result.disbursement.reference).toBeTruthy();
      });
  });

  it("keeps repayment initiation pending until provider settlement", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a mobile money repayment initiation")
      .withRequest("POST", "/api/loans/repayment/pay", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
        builder.jsonBody({ amount: 10000 });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          repayment: like({ id: "22222222-2222-4222-8222-222222222222", total: 106000, amountPaid: 0, amount_paid: 0, status: "scheduled" }),
          attempt: like({ success: false, reason: "pending-customer-approval" }),
          isPartial: boolean(true),
          isPending: boolean(true),
          amount: integer(10000),
          reference: string("KUULA-PAY-001"),
          uuid: string("provider-request-001"),
          message: string("Approve the mobile-money prompt on your phone to complete the repayment."),
        });
      })
      .executeTest(async (mockServer) => {
        const result = await json<{ isPending?: boolean; reference?: string; attempt: { success: boolean } }>(
          `${mockServer.url}/api/loans/repayment/pay`,
          { method: "POST", headers: { Authorization: "Bearer contract-token" }, body: JSON.stringify({ amount: 10000 }) },
        );
        expect(result.isPending).toBe(true);
        expect(result.attempt.success).toBe(false);
        expect(result.reference).toBeTruthy();
      });
  });

  it("keeps notification fields compatible with the existing UI model", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer requests notifications")
      .withRequest("GET", "/api/notifications", (builder) => {
        builder.headers({ Authorization: "Bearer contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          notifications: [like({
            id: "66666666-6666-4666-8666-666666666666",
            user_id: "11111111-1111-4111-8111-111111111111",
            title: "Payment Received",
            body: "Your repayment is settled.",
            type: "success",
            is_read: false,
            created_at: "2026-08-23T10:20:00.000Z",
          })],
        });
      })
      .executeTest(async (mockServer) => {
        const result = await json<{ notifications: Array<{ user_id: string; is_read: boolean; created_at: string }> }>(
          `${mockServer.url}/api/notifications`,
          { headers: { Authorization: "Bearer contract-token" } },
        );
        expect(result.notifications[0].user_id).toBeTruthy();
        expect(result.notifications[0].is_read).toBe(false);
        expect(result.notifications[0].created_at).toBeTruthy();
      });
  });
});
