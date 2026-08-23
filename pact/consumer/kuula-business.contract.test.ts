import path from "node:path";
import { describe, expect, it } from "vitest";
import { Matchers, Pact, SpecificationVersion } from "@pact-foundation/pact";
import { api, configureApiClientForContractTest } from "../../src/app/api/client";
import {
  configurePartnerFinancingApiForContractTest,
  partnerFinancingApi,
} from "../../src/app/api/partner-financing";

const { boolean, integer, like, string } = Matchers;

const pact = new Pact({
  consumer: "KuulaBusinessOperations",
  provider: "KuulaNodeApi",
  dir: path.resolve(process.cwd(), "pacts"),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

describe("Kuula business and admin API contracts", () => {
  it("keeps partner settlement retries shape-compatible", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an already-started partner settlement")
      .withRequest("POST", "/api/network/partner-financing/99999999-9999-4999-8999-999999999999/accept", (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          requestId: string("99999999-9999-4999-8999-999999999999"),
          applicationId: string("33333333-3333-4333-8333-333333333333"),
          applicationStatus: string("disbursing"),
          payee: string("Kuula Partner Clinic"),
          disbursement: like({
            id: "44444444-4444-4444-8444-444444444444",
            status: "pending",
            beneficiaryType: "partner",
            network: "mtn",
            currency: "UGX",
            approvedAmount: 100000,
            totalSettled: 0,
            remainingAmount: 100000,
            legs: [{
              id: "55555555-5555-4555-8555-555555555555",
              sequence: 1,
              amount: 100000,
              status: "pending",
              reference: "KUULA-PARTNER-001",
            }],
          }),
          message: string("Settlement to Kuula Partner Clinic is already being processed."),
        });
      })
      .executeTest(async (mockServer) => {
        configurePartnerFinancingApiForContractTest(mockServer.url);
        const result = await partnerFinancingApi.accept(
          "contract-token",
          "99999999-9999-4999-8999-999999999999",
        );
        expect(result.payee).toBeTruthy();
        expect(result.message).toBeTruthy();
        expect(result.applicationStatus).toBe("disbursing");
      });
  });

  it("keeps admin customer KYC fields available", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an admin requests customer rows")
      .withRequest("GET", "/api/admin/customers", (builder) => {
        builder.headers({ Authorization: "Bearer admin-contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          customers: [{
            id: string("11111111-1111-4111-8111-111111111111"),
            full_name: string("Kuula Test"),
            phone: string("+256700000000"),
            email: string("customer@kuula.test"),
            verified: boolean(true),
            kyc_verified: boolean(true),
            loans_total: integer(2),
            created_at: string("2026-08-23T10:00:00.000Z"),
          }],
        });
      })
      .executeTest(async (mockServer) => {
        configureApiClientForContractTest(mockServer.url);
        const result = await api.getCustomers("admin-contract-token");
        expect(result.customers[0].kyc_verified).toBe(true);
        expect(result.customers[0].loans_total).toBe(2);
      });
  });

  it("keeps all operational loan states representable in admin stats", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an admin requests dashboard statistics")
      .withRequest("GET", "/api/admin/stats", (builder) => {
        builder.headers({ Authorization: "Bearer admin-contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          totalCustomers: integer(10),
          pendingApprovals: integer(2),
          overdueLoans: integer(1),
          recentApplications: [like({
            id: "33333333-3333-4333-8333-333333333333",
            applicantId: "11111111-1111-4111-8111-111111111111",
            applicantName: "Kuula Test",
            amount: 100000,
            purpose: "Working capital",
            termDays: 90,
            channel: "MTN MoMo",
            status: "disbursing",
            total: 106000,
            createdAt: "2026-08-23T10:00:00.000Z",
            decidedAt: "2026-08-23T10:05:00.000Z",
            decisionNotes: "Approved",
            offerExpiresAt: "2026-08-24T10:05:00.000Z",
          })],
          monthlyChart: [like({ month: "Aug", loans: 3, amount: 1 })],
        });
      })
      .executeTest(async (mockServer) => {
        configureApiClientForContractTest(mockServer.url);
        const result = await api.getAdminStats("admin-contract-token");
        expect(result.recentApplications[0].status).toBe("disbursing");
      });
  });

  it("keeps investor pipeline counts explicit", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an admin requests investor reporting")
      .withRequest("GET", "/api/admin/investor-report", (builder) => {
        builder.headers({ Authorization: "Bearer admin-contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          generatedAt: string("2026-08-23T10:30:00.000Z"),
          customers: like({ total: 10, verified: 8, newThisMonth: 2 }),
          loans: like({
            total: 12,
            pending: 2,
            offered: 1,
            disbursing: 1,
            active: 3,
            paid: 4,
            overdue: 1,
            rejected: 0,
            disbursedPrincipal: 800000,
            outstanding: 300000,
          }),
          revenue: like({ totalDisbursed: 800000, totalCollected: 500000, realizedInterest: 40000, expectedInterest: 80000 }),
          ratios: like({ defaultRatePct: 12.5, repaymentRatePct: 50, parPct: 10 }),
          monthly: [like({ month: "Aug 26", disbursed: 100000, collected: 50000, newCustomers: 2 })],
          today: like({ applications: 1, approved: 1, rejected: 0, disbursed: 100000, collected: 0 }),
          daily: [like({ day: "Sun", applications: 1, approved: 1, disbursed: 100000, collected: 0 })],
        });
      })
      .executeTest(async (mockServer) => {
        configureApiClientForContractTest(mockServer.url);
        const result = await api.getInvestorReport("admin-contract-token");
        expect(result.loans.offered).toBeGreaterThanOrEqual(0);
        expect(result.loans.disbursing).toBeGreaterThanOrEqual(0);
      });
  });

  it("keeps the credit operations dashboard contract stable for staff clients", async () => {
    await pact
      .addInteraction()
      .uponReceiving("an admin requests the credit operations dashboard")
      .withRequest("GET", "/api/operations/dashboard", (builder) => {
        builder.headers({ Authorization: "Bearer admin-contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          level: integer(3),
          role: string("admin"),
          counts: like({ final_review: 2 }),
          queue: [like({
            id: "33333333-3333-4333-8333-333333333333",
            current_level: 3,
            status: "final_review",
            updated_at: "2026-08-23T10:30:00.000Z",
            applicant_name: "Kuula Test",
            amount: 100000,
            purpose: "Working capital",
            created_at: "2026-08-23T10:00:00.000Z",
            phone: "+256700000000",
            kyc_verified: true,
            credit_score: 720,
            approved_limit: 500000,
          })],
        });
      })
      .executeTest(async (mockServer) => {
        configureApiClientForContractTest(mockServer.url);
        const result = await api.getCreditOperationsDashboard("admin-contract-token");
        expect(result.level).toBe(3);
        expect(result.role).toBe("admin");
        expect(result.queue).toHaveLength(1);
      });
  });
});
