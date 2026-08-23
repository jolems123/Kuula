import path from "node:path";
import { describe, expect, it } from "vitest";
import { Matchers, Pact, SpecificationVersion } from "@pact-foundation/pact";
import {
  configureCustomerCreditThreadApiForContractTest,
  customerCreditThreadApi,
} from "../../src/app/api/customer-credit-thread";

const { string } = Matchers;

const pact = new Pact({
  consumer: "KuulaCustomerSupport",
  provider: "KuulaNodeApi",
  dir: path.resolve(process.cwd(), "pacts"),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

const applicationId = "33333333-3333-4333-8333-333333333333";
const message = {
  id: string("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  sender_id: string("11111111-1111-4111-8111-111111111111"),
  sender_name: string("Kuula Test"),
  sender_role: string("customer"),
  content: string("Please clarify my credit review."),
  created_at: string("2026-08-23T11:00:00.000Z"),
};

describe("Kuula customer credit-thread contracts", () => {
  it("uses the persisted thread shape when messages are listed", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer requests their application messages")
      .withRequest("GET", `/api/customer/applications/${applicationId}/messages`, (builder) => {
        builder.headers({ Authorization: "Bearer contract-token" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({ messages: [message] });
      })
      .executeTest(async (mockServer) => {
        configureCustomerCreditThreadApiForContractTest(mockServer.url);
        const result = await customerCreditThreadApi.getApplicationMessages("contract-token", applicationId);
        expect(result.messages[0].sender_name).toBe("Kuula Test");
        expect(result.messages[0].created_at).toBeTruthy();
      });
  });

  it("returns the same persisted thread shape immediately after posting", async () => {
    await pact
      .addInteraction()
      .uponReceiving("a customer posts an application message")
      .withRequest("POST", `/api/customer/applications/${applicationId}/messages`, (builder) => {
        builder.headers({ "Content-Type": "application/json", Authorization: "Bearer contract-token" });
        builder.jsonBody({ content: "Please clarify my credit review." });
      })
      .willRespondWith(201, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({ message });
      })
      .executeTest(async (mockServer) => {
        configureCustomerCreditThreadApiForContractTest(mockServer.url);
        const result = await customerCreditThreadApi.postApplicationMessage(
          "contract-token",
          applicationId,
          "Please clarify my credit review.",
        );
        expect(result.message.sender_id).toBeTruthy();
        expect(result.message.sender_name).toBe("Kuula Test");
        expect(result.message.created_at).toBeTruthy();
      });
  });
});
