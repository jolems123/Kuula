import { env } from "../config/env";
import { ApiError } from "./types";

export interface DisbursementLegStatus {
  id: string;
  sequence: number;
  amount: number;
  status: "planned" | "dispatching" | "pending" | "settled" | "failed" | "attention_required" | string;
  reference: string | null;
}

export interface DisbursementBatchStatus {
  id: string;
  status: string;
  beneficiaryType: "customer" | "partner";
  network: "mtn" | "airtel" | string;
  currency: string;
  approvedAmount: number;
  totalSettled: number;
  remainingAmount: number;
  reference?: string;
  legs: DisbursementLegStatus[];
}

async function request<T>(token: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.API_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ApiError("Request timed out. Check your connection.", 0);
    throw new ApiError("Could not reach Kuula servers. Try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function getDisbursementStatus(token: string, applicationId: string) {
  return request<{ applicationStatus: string; disbursement: DisbursementBatchStatus | null }>(
    token,
    `/api/loans/${encodeURIComponent(applicationId)}/disbursement`,
  );
}
