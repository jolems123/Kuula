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
import type { SavingsGoal, AppNotification } from "./types-compat";
import type * as A from "./admin-types";

export { ApiError };
export type { SessionPayload, LoanApplication, LoanQuote, CreditScore, Compliance };

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Builds a query string, skipping empty values. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

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
    request<{ messages: Message[]; participants?: Array<{ id: string; fullName: string; phone: string | null; role: string; active: boolean }> }>("/api/messages", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  markThreadRead: (token: string, fromUserId: string) =>
    request<{ ok: boolean; updated: number }>("/api/messages/read", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fromUserId }),
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

  // ── Admin ──────────────────────────────────────────────────────────────────
  admin: {
    stats: (token: string) => request<A.AdminStats>("/api/admin/stats", { headers: auth(token) }),
    report: (token: string, params: { range?: A.ReportPreset; from?: string; to?: string } = {}) =>
      request<A.AdminReport>(`/api/admin/report${qs(params)}`, { headers: auth(token) }),
    investorReport: (token: string) => request<A.AdminReport>("/api/admin/investor-report", { headers: auth(token) }),
    config: (token: string) => request<A.AdminConfig>("/api/admin/config", { headers: auth(token) }),
    audit: (token: string, params: { page?: number; pageSize?: number; action?: string; entityType?: string; entityId?: string } = {}) =>
      request<A.Paged<A.AdminAuditEvent>>(`/api/admin/audit${qs(params)}`, { headers: auth(token) }),

    customers: (token: string, params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminCustomer>>(`/api/admin/customers${qs(params)}`, { headers: auth(token) }),
    customer: (token: string, id: string) =>
      request<A.AdminCustomerDetail>(`/api/admin/customers/${id}`, { headers: auth(token) }),
    updateCustomer: (token: string, id: string, patch: { fullName?: string; email?: string; district?: string; occupation?: string }) =>
      request<{ ok: boolean; customer: A.AdminCustomer; changed: string[] }>(`/api/admin/customers/${id}`, {
        method: "PATCH", headers: auth(token), body: JSON.stringify(patch),
      }),
    deactivateCustomer: (token: string, id: string, reason: string) =>
      request<{ ok: boolean; customer: A.AdminCustomer }>(`/api/admin/customers/${id}/deactivate`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ reason }),
      }),
    reactivateCustomer: (token: string, id: string, notes?: string) =>
      request<{ ok: boolean; customer: A.AdminCustomer }>(`/api/admin/customers/${id}/reactivate`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ notes }),
      }),

    loans: (token: string, params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminLoanRow>>(`/api/admin/loans${qs(params)}`, { headers: auth(token) }),
    loanSummary: (token: string) => request<A.AdminLoanSummary>("/api/admin/loans/summary", { headers: auth(token) }),
    loan: (token: string, id: string) => request<A.AdminLoanDetail>(`/api/admin/loans/${id}`, { headers: auth(token) }),
    approveLoan: (token: string, id: string, decisionNotes = "") =>
      request<{ ok: boolean; application: A.AdminLoan }>(`/api/admin/loans/${id}/approve`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ decisionNotes }),
      }),
    rejectLoan: (token: string, id: string, decisionNotes: string) =>
      request<{ ok: boolean; application: A.AdminLoan }>(`/api/admin/loans/${id}/reject`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ decisionNotes }),
      }),
    withdrawOffer: (token: string, id: string, decisionNotes: string) =>
      request<{ ok: boolean; application: A.AdminLoan }>(`/api/admin/loans/${id}/withdraw`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ decisionNotes }),
      }),

    kycSummary: (token: string) =>
      request<{ pending: number; approved: number; rejected: number; notSubmitted: number }>("/api/admin/kyc/summary", { headers: auth(token) }),
    kycQueue: (token: string, params: { status?: string; q?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminKycRow>>(`/api/admin/kyc${qs(params)}`, { headers: auth(token) }),
    kyc: (token: string, userId: string) => request<A.AdminKycDetail>(`/api/admin/kyc/${userId}`, { headers: auth(token) }),
    kycDocuments: (token: string, userId: string) =>
      request<A.AdminKycDocuments>(`/api/admin/kyc/${userId}/documents`, { headers: auth(token) }),
    approveKyc: (token: string, userId: string, notes = "") =>
      request<{ ok: boolean; kyc: A.AdminKycRow }>(`/api/admin/kyc/${userId}/approve`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ notes }),
      }),
    rejectKyc: (token: string, userId: string, notes: string) =>
      request<{ ok: boolean; kyc: A.AdminKycRow }>(`/api/admin/kyc/${userId}/reject`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ notes }),
      }),

    transactions: (token: string, params: { q?: string; type?: string; status?: string; range?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminTransaction> & { totals: Record<string, { count: number; amount: number }>; range: { preset: string; label: string } }>(
        `/api/admin/transactions${qs(params)}`, { headers: auth(token) }),
    transaction: (token: string, id: string) =>
      request<{
        transaction: A.AdminTransaction;
        customer: { id: string; fullName: string; phone: string | null; email: string | null };
        loan: A.AdminLoan | null;
        repayment: A.AdminRepayment | null;
        webhookEvents: Array<{ id: string; eventType: string | null; status: string; result: string | null; receivedAt: string; processedAt: string | null }>;
      }>(`/api/admin/transactions/${id}`, { headers: auth(token) }),

    savingsAccounts: (token: string, params: { q?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminSavingsAccount> & { totalBalance: number; accounts: number }>(`/api/admin/savings/accounts${qs(params)}`, { headers: auth(token) }),
    savingsTransactions: (token: string, params: { q?: string; type?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminTransaction> & { totals: Record<string, number> }>(`/api/admin/savings/transactions${qs(params)}`, { headers: auth(token) }),

    ticketSummary: (token: string) =>
      request<{ counts: Record<string, number>; openTotal: number }>("/api/admin/tickets/summary", { headers: auth(token) }),
    tickets: (token: string, params: { status?: string; q?: string; priority?: string; assignee?: string; page?: number; pageSize?: number } = {}) =>
      request<A.Paged<A.AdminTicket>>(`/api/admin/tickets${qs(params)}`, { headers: auth(token) }),
    ticket: (token: string, id: string) => request<A.AdminTicketDetail>(`/api/admin/tickets/${id}`, { headers: auth(token) }),
    createTicket: (token: string, body: { customerId: string; subject: string; category: string; priority: string; body?: string }) =>
      request<{ ok: boolean; ticket: A.AdminTicket }>("/api/admin/tickets", { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
    replyTicket: (token: string, id: string, body: string) =>
      request<{ ok: boolean; message: A.AdminTicketMessage; ticket: A.AdminTicket }>(`/api/admin/tickets/${id}/messages`, {
        method: "POST", headers: auth(token), body: JSON.stringify({ body }),
      }),
    updateTicket: (token: string, id: string, patch: { status?: string; priority?: string; category?: string; subject?: string; assigneeId?: string | null }) =>
      request<{ ok: boolean; ticket: A.AdminTicket; changed: string[] }>(`/api/admin/tickets/${id}`, {
        method: "PATCH", headers: auth(token), body: JSON.stringify(patch),
      }),

    staff: (token: string) => request<{ staff: A.AdminStaff[] }>("/api/admin/staff", { headers: auth(token) }),
    createStaff: (token: string, body: { fullName: string; email: string; password: string }) =>
      request<{ ok: boolean; staff: A.AdminStaff }>("/api/admin/staff", { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
    updateStaff: (token: string, id: string, body: { fullName: string }) =>
      request<{ ok: boolean; staff: A.AdminStaff }>(`/api/admin/staff/${id}`, { method: "PATCH", headers: auth(token), body: JSON.stringify(body) }),
    deactivateStaff: (token: string, id: string, reason?: string) =>
      request<{ ok: boolean; staff: A.AdminStaff }>(`/api/admin/staff/${id}/deactivate`, { method: "POST", headers: auth(token), body: JSON.stringify({ reason }) }),
    reactivateStaff: (token: string, id: string) =>
      request<{ ok: boolean; staff: A.AdminStaff }>(`/api/admin/staff/${id}/reactivate`, { method: "POST", headers: auth(token), body: JSON.stringify({}) }),
  },};

export const api = nodeApi;
