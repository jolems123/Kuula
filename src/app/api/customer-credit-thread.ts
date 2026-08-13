import { env } from "../config/env";
import { ApiError } from "./types";

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.API_BASE_URL}/api/customer${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const customerCreditThreadApi = {
  list: (token: string, applicationId: string) => call<{ messages: Array<Record<string, any>> }>(token, `/applications/${applicationId}/messages`),
  post: (token: string, applicationId: string, content: string) => call<{ message: Record<string, unknown> }>(token, `/applications/${applicationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
};
