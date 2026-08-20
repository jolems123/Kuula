import { env } from "../config/env";
import { ApiError } from "./types";

export interface NotificationPreferences {
  loanDecision: boolean;
  repaymentReminders: boolean;
  overdueAlerts: boolean;
  disbursementUpdates: boolean;
  securityAlerts: true;
}

async function request<T>(token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.API_BASE_URL}/api/notifications/preferences`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  return body as T;
}

export async function getNotificationPreferences(token: string): Promise<NotificationPreferences> {
  const result = await request<{ preferences: NotificationPreferences }>(token);
  return result.preferences;
}

export async function updateNotificationPreferences(
  token: string,
  preferences: Partial<Omit<NotificationPreferences, "securityAlerts">>
): Promise<NotificationPreferences> {
  const result = await request<{ preferences: NotificationPreferences }>(token, {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
  return result.preferences;
}
