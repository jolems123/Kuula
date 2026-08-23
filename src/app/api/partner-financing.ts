import { env } from "../config/env";
import { ApiError, type PartnerFinancingRequestInput } from "./types";

let apiBaseUrl = env.API_BASE_URL;
let apiTimeoutMs = env.API_TIMEOUT_MS;

/** Pact-only hook so contract tests exercise the production partner client. */
export function configurePartnerFinancingApiForContractTest(baseUrl: string, timeoutMs = 5_000): void {
  if (import.meta.env.PROD) throw new Error("Contract-test API overrides are disabled in production builds");
  apiBaseUrl = baseUrl.replace(/\/$/, "");
  apiTimeoutMs = timeoutMs;
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiTimeoutMs);
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ApiError("Request timed out. Check your connection.", 0);
    throw new ApiError("Could not reach Kuula servers. Try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export interface SubmittedPartnerFinancing {
  request: {
    id: string;
    status: string;
    amount: number;
    partner: string;
    partnerLocation: string | null;
    product: string;
    applicationId: string;
    applicationStatus: string;
    underwritingStatus: string;
    message: string;
  };
}

export interface PartnerSettlementResponse {
  requestId: string;
  applicationId: string;
  applicationStatus: string;
  payee: string;
  disbursement: {
    id: string;
    status: string;
    beneficiaryType: "partner" | "customer";
    network: "mtn" | "airtel";
    currency: string;
    approvedAmount: number;
    totalSettled: number;
    remainingAmount: number;
    legs: Array<{ id: string; sequence: number; amount: number; status: string; reference: string | null }>;
  } | null;
  message: string;
}

export const partnerFinancingApi = {
  submit: (token: string, input: PartnerFinancingRequestInput) =>
    request<SubmittedPartnerFinancing>(token, "/api/network/partner-financing", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  accept: (token: string, requestId: string) =>
    request<PartnerSettlementResponse>(token, `/api/network/partner-financing/${encodeURIComponent(requestId)}/accept`, {
      method: "POST",
    }),
};
