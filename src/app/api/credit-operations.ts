import { env } from "../config/env";
import { ApiError } from "./types";

async function opRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.API_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.API_BASE_URL}/api/operations${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
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

async function evidenceAccess(token: string, evidenceId: string): Promise<{ url: string; expiresInSeconds?: number; revokeAfterUse?: boolean }> {
  const res = await fetch(`${env.API_BASE_URL}/api/operations/evidence/${encodeURIComponent(evidenceId)}/access`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await res.json() as { url?: string; expiresInSeconds?: number };
    if (!body.url) throw new ApiError("Evidence access URL was not returned", 500);
    return { url: body.url, expiresInSeconds: body.expiresInSeconds };
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), revokeAfterUse: true };
}

export interface OperationsQueueItem {
  id: string;
  current_level: number;
  status: string;
  applicant_name: string;
  amount: number;
  purpose: string;
  created_at: string;
  updated_at: string;
  phone?: string | null;
  kyc_verified?: boolean;
  credit_score?: number | null;
  approved_limit?: number | null;
}

export interface OperationsStaff {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: "officer" | "manager" | "admin";
  activeCases: number;
}

export const creditOperationsApi = {
  dashboard: (token: string) => opRequest<{ level: number; role: string; counts: Record<string, number>; queue: OperationsQueueItem[] }>(token, "/dashboard"),
  intake: (token: string) => opRequest<{ applications: Array<Record<string, unknown>> }>(token, "/intake"),
  staff: (token: string, role?: string) => opRequest<{ staff: OperationsStaff[] }>(token, `/staff${role ? `?role=${encodeURIComponent(role)}` : ""}`),
  assign: (token: string, applicationId: string, assigneeId: string, level = 1) => opRequest<{ ok: boolean }>(token, `/applications/${applicationId}/assign`, { method: "POST", body: JSON.stringify({ assigneeId, level }) }),
  caseDetail: (token: string, applicationId: string) => opRequest<Record<string, any>>(token, `/applications/${applicationId}`),
  saveEvaluation: (token: string, applicationId: string, body: Record<string, unknown>) => opRequest<{ ok: boolean; evaluationId: string; version: number }>(token, `/applications/${applicationId}/evaluation`, { method: "POST", body: JSON.stringify(body) }),
  uploadEvidence: (token: string, applicationId: string, body: Record<string, unknown>) => opRequest<{ evidence: Record<string, unknown> }>(token, `/applications/${applicationId}/evidence`, { method: "POST", body: JSON.stringify(body) }),
  submit: (token: string, applicationId: string, body: Record<string, unknown>) => opRequest<{ ok: boolean; fromLevel: number; toLevel: number }>(token, `/applications/${applicationId}/submit`, { method: "POST", body: JSON.stringify(body) }),
  decide: (token: string, applicationId: string, body: Record<string, unknown>) => opRequest<{ ok: boolean; status: string; canonicalDecisionRequired?: boolean }>(token, `/applications/${applicationId}/decision`, { method: "POST", body: JSON.stringify(body) }),
  postMessage: (token: string, applicationId: string, content: string, recipientId?: string, messageType: "internal" | "customer" = "internal") => opRequest<{ message: Record<string, unknown> }>(token, `/applications/${applicationId}/messages`, { method: "POST", body: JSON.stringify({ content, recipientId, messageType }) }),
  search: (token: string, q: string) => opRequest<{ customers: Array<Record<string, any>>; applications: Array<Record<string, any>>; businesses: Array<Record<string, any>> }>(token, `/search?q=${encodeURIComponent(q)}`),
  customer360: (token: string, customerId: string) => opRequest<Record<string, any>>(token, `/customers/${customerId}/360`),
  evidenceAccess,
};
