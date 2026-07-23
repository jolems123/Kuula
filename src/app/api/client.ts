/**
 * Kuula API client.
 *
 * Node/Express backend only.
 * Screens import `{ api }` directly and do not switch providers.
 */
import { env } from "../config/env";
import type { Message } from "../context/AppContext";
import {
  ApiError,
  type SessionPayload, type LoanApplication, type LoanQuote,
  type CreditScore, type Compliance,
} from "./types";
import type { AdminStats, InvestorReport, CustomerRow, SavingsGoal, AppNotification } from "./types-compat";

export { ApiError };
export type { SessionPayload, LoanApplication, LoanQuote, CreditScore, Compliance };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.API_TIMEOUT_MS);
  try {
    const res = await fetch(env.API_BASE_URL + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
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

const nodeApi = {
  health: () => request<{ ok: boolean }>("/api/health"),

  login: (phone: string, pin: string) =>
    request<SessionPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, pin }),
    }),

  adminLogin: (email: string, password: string) =>
    request<SessionPayload>("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signUp: (input: { name: string; phone: string; email: string; password: string; nationalId: string }) =>
    request<{ ok: boolean; needsConfirmation?: boolean }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  signOut: async (): Promise<void> => {},

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
    request<SessionPayload>("/api/auth/verify-phone", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),

  submitKyc: (
    token: string,
    body: { nationalId: string; fullName: string; dob: string; documentType?: string; documentRef?: string }
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

  acceptLoan: (token: string, id: string) =>
    request<{ application: LoanApplication }>(`/api/loans/${id}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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

  payRepayment: (token: string, amount?: number) =>
    request<{ repayment: Record<string, unknown>; attempt: { success: boolean; reason: string }; isPartial?: boolean; amount?: number; reference?: string; uuid?: string }>("/api/loans/repayment/pay", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: amount !== undefined ? JSON.stringify({ amount }) : undefined,
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
