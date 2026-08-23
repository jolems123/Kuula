import path from "node:path";
import { describe, expect, it } from "vitest";
import { Matchers, Pact, SpecificationVersion } from "@pact-foundation/pact";
import { api, configureApiClientForContractTest } from "../../src/app/api/client";

const { boolean, integer, like, string } = Matchers;

const pact = new Pact({
  consumer: "KuulaWebMobileRealClient",
  provider: "KuulaNodeApi",
  dir: path.resolve(process.cwd(), "pacts"),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

const TOKEN = "contract-token";

function useMockProvider(url: string): void {
  configureApiClientForContractTest(url, 5_000);
}

describe("Kuula real API client contracts", () => {
  it("reads notification camelCase fields through the real client", async () => {
    await pact
      .addInteraction()
      .uponReceiving("notifications requested by the real Kuula client")
      .withRequest("GET", "/api/notifications", (builder) => {
        builder.headers({ Authorization: `Bearer ${TOKEN}` });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          notifications: [{
            id: string("66666666-6666-4666-8666-666666666666"),
            userId: string("11111111-1111-4111-8111-111111111111"),
            title: string("Payment Received"),
            body: string("Your repayment is settled."),
            type: string("success"),
            isRead: boolean(false),
            createdAt: string("2026-08-23T10:20:00.000Z"),
          }],
        });
      })
      .executeTest(async (mockServer) => {
        useMockProvider(mockServer.url);
        const result = await api.getNotifications(TOKEN);
        expect(result.notifications[0].isRead).toBe(false);
        expect(result.notifications[0].createdAt).toBeTruthy();
      });
  });

  it("reads authoritative transaction fields through the real client", async () => {
    await pact
      .addInteraction()
      .uponReceiving("transaction history requested by the real Kuula client")
      .withRequest("GET", "/api/transactions", (builder) => {
        builder.headers({ Authorization: `Bearer ${TOKEN}` });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          transactions: [{
            id: string("77777777-7777-4777-8777-777777777777"),
            loanId: string("88888888-8888-4888-8888-888888888888"),
            type: string("loan_payment"),
            amount: integer(10000),
            status: string("completed"),
            reference: string("KUULA-PAY-001"),
            provider: string("marzpay"),
            providerStatus: string("completed"),
            reconciliationStatus: string("matched"),
            createdAt: string("2026-08-23T10:20:00.000Z"),
            updatedAt: string("2026-08-23T10:21:00.000Z"),
          }],
        });
      })
      .executeTest(async (mockServer) => {
        useMockProvider(mockServer.url);
        const result = await api.getTransactions(TOKEN);
        expect(result.transactions[0].reference).toBe("KUULA-PAY-001");
        expect(result.transactions[0].createdAt).toBeTruthy();
      });
  });

  it("requires agreement proof fields through the real client", async () => {
    const applicationId = "33333333-3333-4333-8333-333333333333";
    await pact
      .addInteraction()
      .uponReceiving("agreement acceptance by the real Kuula client")
      .withRequest("POST", `/api/loans/${applicationId}/agreement/accept`, (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` });
        builder.jsonBody({ clientContext: { source: "pact-real-client" } });
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
        useMockProvider(mockServer.url);
        const result = await api.acceptLoanAgreement(TOKEN, applicationId, { source: "pact-real-client" });
        expect(result.ok).toBe(true);
        expect(result.agreementHash).toHaveLength(64);
      });
  });

  it("does not treat repayment initiation as provider settlement", async () => {
    await pact
      .addInteraction()
      .uponReceiving("repayment initiation by the real Kuula client")
      .withRequest("POST", "/api/loans/repayment/pay", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` });
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
          message: string("Approve the mobile-money prompt on your phone to complete the repayment."),
        });
      })
      .executeTest(async (mockServer) => {
        useMockProvider(mockServer.url);
        const result = await api.payRepayment(TOKEN, 10000);
        expect(result.isPending).toBe(true);
        expect(result.attempt.success).toBe(false);
        expect(result.attempt.reason).toBe("pending-customer-approval");
      });
  });
});
