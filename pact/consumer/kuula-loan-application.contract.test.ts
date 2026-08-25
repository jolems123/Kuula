import path from "node:path";
import { describe, expect, it } from "vitest";
import { Matchers, Pact, SpecificationVersion } from "@pact-foundation/pact";
import { api, configureApiClientForContractTest } from "../../src/app/api/client";
import type { LoanDraft } from "../../src/app/lib/selection";

const { integer, like, string } = Matchers;

const pact = new Pact({
  consumer: "KuulaLoanApplication",
  provider: "KuulaNodeApi",
  dir: path.resolve(process.cwd(), "pacts"),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

describe("Kuula loan application contract", () => {
  it("submits and returns persisted livelihood details", async () => {
    const draft: LoanDraft = {
      amount: 200000,
      termDays: 90,
      purpose: "Business",
      channel: "MTN MoMo",
      employmentStatus: "Business owner",
      occupationOrBusiness: "Retail trader",
      employerOrBusinessName: "Kampala Retail Shop",
      workDuration: "2+ years",
      incomeSource: "Business",
      repaymentSource: "Shop sales",
      declaredMonthlyIncome: 900000,
      declaredMonthlyExpenses: 350000,
      existingDebtPayment: 50000,
    };

    await pact
      .addInteraction()
      .uponReceiving("a complete livelihood-aware loan application")
      .withRequest("POST", "/api/loans/applications", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
        builder.jsonBody(draft);
      })
      .willRespondWith(201, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          application: like({
            id: "33333333-3333-4333-8333-333333333333",
            applicantId: "11111111-1111-4111-8111-111111111111",
            applicantName: "Kuula Test",
            amount: 200000,
            purpose: "Business",
            termDays: 90,
            channel: "MTN MoMo",
            status: "pending",
            total: 206000,
            apr: 0.24,
            interest: 6000,
            createdAt: "2026-08-25T13:00:00.000Z",
            decidedAt: null,
            decisionNotes: null,
            offerExpiresAt: null,
            underwritingStatus: null,
            employmentStatus: "Business owner",
            occupationOrBusiness: "Retail trader",
            employerOrBusinessName: "Kampala Retail Shop",
            workDuration: "2+ years",
            incomeSource: "Business",
            repaymentSource: "Shop sales",
          }),
        });
      })
      .executeTest(async (mockServer) => {
        configureApiClientForContractTest(mockServer.url);
        const result = await api.submitApplication("contract-token", draft);
        expect(result.application.amount).toBe(200000);
        expect(result.application.employmentStatus).toBe("Business owner");
        expect(result.application.incomeSource).toBe("Business");
        expect(result.application.repaymentSource).toBe("Shop sales");
      });
  });
});
