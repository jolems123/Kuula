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
        builder.headers({
          "Content-Type": "application/json",
          Authorization: "Bearer contract-token",
        });
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
          {
            method: "POST",
            headers: { Authorization: "Bearer contract-token" },
            body: JSON.stringify({ amount: 100000, termDays: 90 }),
          },
        );
        expect(quote.total).toBeGreaterThanOrEqual(quote.principal);
        expect(quote.compound).toBe(false);
      });
  });

  it("keeps repayment initiation provider-pending instead of pretending settlement", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a mobile money repayment initiation")
      .withRequest("POST", "/api/loans/repayment/pay", (builder) => {
        builder.headers({
          "Content-Type": "application/json",
          Authorization: "Bearer contract-token",
        });
        builder.jsonBody({ amount: 10000 });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          repayment: like({
            id: "22222222-2222-4222-8222-222222222222",
            total: 106000,
            amount_paid: 0,
            status: "scheduled",
          }),
          attempt: like({ success: true, reason: "provider-pending" }),
          isPartial: boolean(true),
          isPending: boolean(true),
          amount: integer(10000),
          reference: string("KUULA-PAY-001"),
          uuid: string("provider-request-001"),
        });
      })
      .executeTest(async (mockServer) => {
        const result = await json<{ isPending?: boolean; reference?: string }>(
          `${mockServer.url}/api/loans/repayment/pay`,
          {
            method: "POST",
            headers: { Authorization: "Bearer contract-token" },
            body: JSON.stringify({ amount: 10000 }),
          },
        );
        expect(result.isPending).toBe(true);
        expect(result.reference).toBeTruthy();
      });
  });
});
