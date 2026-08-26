import { env } from "../config/env";
import { ApiError } from "./types";

let apiBaseUrl = env.API_BASE_URL;

/** Pact-only hook so contract tests exercise the production thread client. */
export function configureCustomerCreditThreadApiForContractTest(baseUrl: string): void {
  if (import.meta.env.PROD) throw new Error("Contract-test API overrides are disabled in production builds");
  apiBaseUrl = baseUrl.replace(/\/$/, "");
}

export interface CustomerCreditThreadMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const getApplicationMessages = (token: string, applicationId: string) =>
  request<{ messages: CustomerCreditThreadMessage[] }>(token, `/api/customer/applications/${encodeURIComponent(applicationId)}/messages`);

const postApplicationMessage = (token: string, applicationId: string, content: string) =>
  request<{ message: CustomerCreditThreadMessage }>(token, `/api/customer/applications/${encodeURIComponent(applicationId)}/messages`, { method: "POST", body: JSON.stringify({ content }) });

export const customerCreditThreadApi = {
  getApplicationMessages,
  postApplicationMessage,
  list: getApplicationMessages,
  post: postApplicationMessage,
};
