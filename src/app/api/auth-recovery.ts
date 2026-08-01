import { env } from "../config/env";
import { ApiError } from "./types";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT_MS);
  try {
    const response = await fetch(env.API_BASE_URL + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out. Check your connection.", 0);
    }
    throw new ApiError("Could not reach Kuula servers. Try again.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export const authRecoveryApi = {
  requestPasswordReset: (identifier: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  confirmPasswordReset: (identifier: string, code: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/reset-password/confirm", {
      method: "POST",
      body: JSON.stringify({ identifier, code, newPassword }),
    }),

  revokeSession: (token: string) =>
    request<{ ok: boolean }>("/api/auth/signout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
};
