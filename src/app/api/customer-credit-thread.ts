import { env } from "../config/env";
import { ApiError } from "./types";

export interface CustomerCreditThreadMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const customerCreditThreadApi = {
  getApplicationMessages: (token: string, applicationId: string) =>
    request<{ messages: CustomerCreditThreadMessage[] }>(token, `/api/customer/applications/${encodeURIComponent(applicationId)}/messages`),
  postApplicationMessage: (token: string, applicationId: string, content: string) =>
    request<{ message: CustomerCreditThreadMessage }>(token, `/api/customer/applications/${encodeURIComponent(applicationId)}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
};
