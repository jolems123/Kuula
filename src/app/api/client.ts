/**
 * Kuula API client.
 *
 * Node/Express backend only.
 * Screens import `{ api }` directly and do not switch providers.
 */
import { env } from "../config/env";
import type { Message } from "../context/AppContext";
import { getAccessToken, adoptSession, endSession } from "../lib/session";
import { isNativePlatform } from "../lib/secure-store";
import {
  ApiError,
  type SessionPayload, type LoanApplication, type LoanQuote,
  type CreditScore, type Compliance,
} from "./types";
import type { AdminStats, InvestorReport, CustomerRow, SavingsGoal, AppNotification } from "./types-compat";

export { ApiError };
export type { SessionPayload, LoanApplication, LoanQuote, CreditScore, Compliance };

function platformHeaders(): Record<string, string> {
  // Tells the server to return the refresh token in the body (for the OS
  // keystore) rather than as a cookie. Web gets the httpOnly cookie instead.
  return isNativePlatform() ? { "X-Client-Platform": "native" } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.API_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...platformHeaders(),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  // Screens still pass the token they were handed at login. Access tokens now
  // expire after 15 minutes, so that value goes stale while a screen is open.
  // Any request that wants authentication gets the CURRENT token instead,
  // refreshing it transparently — which is why no screen had to change.
  if (headers.Authorization) {
    const fresh = await getAccessToken();
    if (!fresh) throw new ApiError("Your session has expired. Please sign in again.", 401);
    headers.Authorization = `Bearer ${fresh}`;
  }

  try {
    const res = await fetch(env.API_BASE_URL + path, {
      ...init,
      headers,
      // Carries the httpOnly refresh cookie on web.
      credentials: "include",
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("Request timed out. Check your connection.", 0);
    }
    throw new ApiError("Could not reach Kuula servers. Try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Wraps a call that establishes a session so the token is captured centrally. */
async function withSession(promise: Promise<SessionPayload>): Promise<SessionPayload> {
  const payload = await promise;
  await adoptSession(payload as unknown as { token: string; refreshToken?: string; expiresIn?: number });
  return payload;
}

const nodeApi = {
  health: () => request<{ ok: boolean }>("/api/health"),

  login: (phone: string, pin: string) =>
    withSession(
      request<SessionPayload>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, pin }),
      })
    ),

  adminLogin: (email: string, password: string) =>
    withSession(
      request<SessionPayload>("/api/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
    ),

  signUp: (input: { name: string; phone: string; email: string; password: string; nationalId: string; acceptedTerms?: boolean; termsVersion?: string }) =>
    request<{ ok: boolean; needsConfirmation?: boolean }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Revokes the refresh token server-side, then clears local credentials. */
  signOut: (): Promise<void> => endSession(),

  /** Signs out every device — used after a password change or a security concern. */
  signOutAll: (token: string) =>
    request<{ ok: boolean; revoked: number }>("/api/auth/signout-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  deleteAccount: (token: string) =>
    request<{ ok: boolean }>("/api/users/me/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  resetPassword: (email: string) =>
    request<{ ok: boolean }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyPhone: (phone: string, code: string) =>
    withSession(
      request<SessionPayload>("/api/auth/verify-phone", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      })
    ),

  submitKyc: (
    token: string,
    body: {
      nationalId: string;
      fullName: string;
      dob: string;
      documentType?: string;
      /** Front ID image as a base64 data URL (data:image/...;base64,...). */
      documentFront: string;
      /** Back ID image as a base64 data URL. */
      documentBack: string;
    }
  ) =>
    request<{ ok: boolean; kyc: Record<string, unknown> }>("/api/kyc/submit", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),

  getKycStatus: (token: string) =>
    request<{ kyc: Record<string, unknown> }>("/api/kyc/status", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  resendOtp: (phone: string) =>
    request<{ ok: boolean }>("/api/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  me: (token: string) =>
    request<SessionPayload>("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getMessages: (token: string) =>
    request<{ messages: Message[] }>("/api/messages", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  postMessage: (token: string, content: string, receiverId?: string) =>
    request<{ message: Message }>("/api/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, receiverId }),
    }),

  getApplications: (token: string) =>
    request<{ applications: LoanApplication[] }>("/api/loans/applications", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  submitApplication: (
    token: string,
    body: { amount: number; purpose: string; termDays: number; channel?: string }
  ) =>
    request<{ application: LoanApplication }>("/api/loans/applications", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),

  decideApplication: (
    token: string,
    id: string,
    decision: "approved" | "rejected",
    notes = ""
  ) =>
    request<{ application: LoanApplication }>("/api/loans/applications/decision", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, decision, notes }),
    }),

  /**
   * Accepts a loan offer, which requests a REAL mobile-money payout.
   *
   * Resolves as soon as the provider ACKNOWLEDGES the request — the loan is not
   * disbursed yet. `disbursement.status` is "pending" until the provider
   * confirms it on the server's webhook.
   */
  acceptLoan: (token: string, id: string) =>
    request<{
      application: LoanApplication | null;
      disbursement: {
        status: "pending" | "failed" | "already_requested" | "already_disbursed";
        reference: string | null;
        providerRef: string | null;
        amount: number;
        message: string;
        needsReconciliation: boolean;
      };
    }>(`/api/loans/${id}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // Collapses a double-tap, a client retry and a reconnect onto one payout.
        "Idempotency-Key": `disburse:${id}`,
      },
    }),

  compliance: () => request<Compliance>("/api/compliance"),

  creditScore: (token: string) =>
    request<CreditScore>("/api/credit/score", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  quoteLoan: (token: string, amount: number, termDays: number) =>
    request<LoanQuote>("/api/loans/quote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount, termDays }),
    }),

  getSavings: (token: string) =>
    request<{ balance: number; accruedInterest: number; aprPercent: number }>("/api/savings", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  depositSavings: (token: string, amount: number) =>
    request<{ balance: number }>("/api/savings/deposit", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    }),

  withdrawSavings: (token: string, amount: number) =>
    request<{ balance: number }>("/api/savings/withdraw", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    }),

  topupWallet: (token: string, amount: number) =>
    request<{ balance: number }>("/api/wallet/topup", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    }),

  getTransactions: (token: string) =>
    request<{ transactions: Array<Record<string, unknown>> }>("/api/transactions", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getRepayment: (token: string) =>
    request<{ repayment: null | (Record<string, unknown> & { collection: { stage: string; label: string; daysToDue: number } }) }>("/api/loans/repayment", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  /**
   * Requests a REAL mobile-money collection. The borrower's balance is NOT
   * reduced here — `isPending` means a prompt was sent to their handset, and
   * the balance moves only when the provider confirms it on the webhook.
   */
  payRepayment: (token: string, amount?: number) =>
    request<{
      repayment: Record<string, unknown> | null;
      attempt: { success: boolean; reason: string };
      isPending: boolean;
      isPartial?: boolean;
      status: "pending" | "failed" | "none";
      amount?: number;
      reference?: string;
      uuid?: string;
      message?: string;
    }>("/api/loans/repayment/pay", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: amount !== undefined ? JSON.stringify({ amount }) : JSON.stringify({}),
    }),

  requestTopUp: (token: string, body: { amount: number; term_days: number; purpose: string; disbursement_method: string }) =>
    request<{ success: boolean; loan_id?: string; status?: string; reason?: string; pricing?: Record<string, unknown> }>("/api/loans/top-up", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),

  // ── Savings goals ───────────────────────────────────────────────────────────
  getGoals: (token: string) =>
    request<{ goals: SavingsGoal[] }>("/api/goals", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  createGoal: (token: string, body: { name: string; emoji: string; target: number; color?: string }) =>
    request<{ goal: SavingsGoal }>("/api/goals", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  updateGoal: (token: string, id: string, patch: Record<string, unknown>) =>
    request<{ goal: SavingsGoal }>(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    }),
  deleteGoal: (token: string, id: string) =>
    request<{ ok: boolean }>(`/api/goals/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Notifications ──────────────────────────────────────────────────────────
  getNotifications: (token: string) =>
    request<{ notifications: AppNotification[] }>("/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  markNotificationRead: (token: string, id: string) =>
    request<{ ok: true }>(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  markAllNotificationsRead: (token: string) =>
    request<{ ok: true }>("/api/notifications/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  // ── Admin stats ────────────────────────────────────────────────────────────
  getAdminStats: (token: string) =>
    request<AdminStats>("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getCustomers: (token: string) =>
    request<{ customers: CustomerRow[] }>("/api/admin/customers", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getSavingsOverview: (token: string) =>
    request<{ accounts: { user_id: string; full_name: string; balance: number }[]; total: number }>("/api/admin/savings-overview", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getInvestorReport: (token: string) =>
    request<InvestorReport>("/api/admin/investor-report", {
      headers: { Authorization: `Bearer ${token}` },
    }),
};

export const api = nodeApi;
