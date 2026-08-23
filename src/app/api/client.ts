/** Kuula Node/Express API client. PostgreSQL is the only production datastore. */
import { env } from "../config/env";
import type { Message } from "../context/AppContext";
import {
  ApiError,
  type SessionPayload,
  type AdminMfaPayload,
  type LoanApplication,
  type LoanQuote,
  type CreditScore,
  type Compliance,
  type NetworkOverview,
  type CreditProduct,
  type KuulaPartner,
  type CreditPass,
  type GrowthLine,
  type KuulaMarket,
  type PartnerFinancingRequestInput,
} from "./types";
import type { AdminStats, InvestorReport, CustomerRow, AppNotification } from "./types-compat";

export { ApiError };
export type {
  SessionPayload,
  AdminMfaPayload,
  LoanApplication,
  LoanQuote,
  CreditScore,
  Compliance,
  NetworkOverview,
  CreditProduct,
  KuulaPartner,
  CreditPass,
  GrowthLine,
  KuulaMarket,
  PartnerFinancingRequestInput,
};

let apiBaseUrl = env.API_BASE_URL;
let apiTimeoutMs = env.API_TIMEOUT_MS;

/** Pact-only hook so contract tests exercise this real consumer client. */
export function configureApiClientForContractTest(baseUrl: string, timeoutMs = 5_000): void {
  if (import.meta.env.PROD) throw new Error("Contract-test API overrides are disabled in production builds");
  apiBaseUrl = baseUrl.replace(/\/$/, "");
  apiTimeoutMs = timeoutMs;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiTimeoutMs);
  try {
    const res = await fetch(apiBaseUrl + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new ApiError("Request timed out. Check your connection.", 0);
    throw new ApiError("Could not reach Kuula servers. Try again.", 0);
  } finally { clearTimeout(timer); }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const query = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  const value = params.toString();
  return value ? `?${value}` : "";
};

const nodeApi = {
  health: () => request<{ ok: boolean; realMoneyEnabled?: boolean }>("/api/health"),
  login: (phone: string, pin: string) => request<SessionPayload>("/api/auth/login", { method: "POST", body: JSON.stringify({ phone, pin }) }),
  adminLogin: (email: string, password: string) => request<SessionPayload | AdminMfaPayload>("/api/auth/admin-login", { method: "POST", body: JSON.stringify({ email, password }) }),
  verifyAdminMfa: (challengeToken: string, code: string) => request<SessionPayload>("/api/auth/admin-login/verify", { method: "POST", body: JSON.stringify({ challengeToken, code }) }),
  resendAdminMfa: (challengeToken: string) => request<{ ok: boolean }>("/api/auth/admin-login/resend", { method: "POST", body: JSON.stringify({ challengeToken }) }),
  refresh: (refreshToken: string) => request<{ token: string; refreshToken: string; accessExpiresInSeconds: number }>("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  signUp: (input: { name: string; phone: string; email?: string; password: string; nationalId: string; acceptedTerms?: boolean; termsVersion?: string }) => request<{ ok: boolean; needsConfirmation?: boolean }>("/api/auth/signup", { method: "POST", body: JSON.stringify(input) }),
  signOut: (token: string) => request<{ ok: boolean }>("/api/auth/signout", { method: "POST", headers: auth(token) }),
  signOutAll: (token: string) => request<{ ok: boolean }>("/api/auth/signout-all", { method: "POST", headers: auth(token) }),
  deleteAccount: (token: string) => request<{ ok: boolean }>("/api/users/me/delete", { method: "POST", headers: auth(token) }),
  resetPassword: (email: string) => request<{ ok: boolean }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email }) }),
  verifyPhone: (phone: string, code: string) => request<SessionPayload>("/api/auth/verify-phone", { method: "POST", body: JSON.stringify({ phone, code }) }),
  resendOtp: (phone: string) => request<{ ok: boolean }>("/api/auth/resend-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  me: (token: string) => request<SessionPayload>("/api/auth/me", { headers: auth(token) }),
  markets: () => request<{ markets: KuulaMarket[] }>("/api/network/markets"),
  networkOverview: (token: string, market = "UG") => request<NetworkOverview>(`/api/network/overview${query({ market })}`, { headers: auth(token) }),
  growthLine: (token: string, market = "UG") => request<{ growthLine: GrowthLine }>(`/api/network/growth-line${query({ market })}`, { headers: auth(token) }),
  creditPass: (token: string, market = "UG") => request<{ creditPass: CreditPass }>(`/api/network/credit-pass${query({ market })}`, { headers: auth(token) }),
  creditProducts: (token: string, market = "UG") => request<{ products: CreditProduct[] }>(`/api/network/products${query({ market })}`, { headers: auth(token) }),
  partners: (token: string, market = "UG", type?: string) => request<{ partners: KuulaPartner[] }>(`/api/network/partners${query({ market, type })}`, { headers: auth(token) }),
  partnerFinancingRequests: (token: string) => request<{ requests: Array<Record<string, unknown>> }>("/api/network/partner-financing", { headers: auth(token) }),
  submitPartnerFinancing: (token: string, input: PartnerFinancingRequestInput) => request<{ request: { id: string; status: string; amount: number; partner: string; product: string; message: string } }>("/api/network/partner-financing", { method: "POST", headers: auth(token), body: JSON.stringify(input) }),
  submitKyc: (token: string, body: { nationalId: string; fullName: string; dob: string; documentType?: string; documentFront: string; documentBack: string }) => request<{ ok: boolean; kyc: Record<string, unknown> }>("/api/kyc/submit", { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  getKycStatus: (token: string) => request<{ kyc: Record<string, unknown> }>("/api/kyc/status", { headers: auth(token) }),
  getMessages: (token: string) => request<{ messages: Message[] }>("/api/messages", { headers: auth(token) }),
  postMessage: (token: string, content: string, receiverId?: string) => request<{ message: Message }>("/api/messages", { method: "POST", headers: auth(token), body: JSON.stringify({ content, receiverId }) }),
  getApplications: (token: string) => request<{ applications: LoanApplication[] }>("/api/loans/applications", { headers: auth(token) }),
  submitApplication: (token: string, body: { amount: number; purpose: string; termDays: number; channel?: string; declaredMonthlyIncome: number; declaredMonthlyExpenses: number; existingDebtPayment: number }) => request<{ application: LoanApplication }>("/api/loans/applications", { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  decideApplication: (token: string, id: string, decision: "approved" | "rejected", notes: string) => request<{ application: LoanApplication }>("/api/loans/applications/decision", { method: "POST", headers: auth(token), body: JSON.stringify({ id, decision, notes }) }),
  acceptLoanAgreement: (token: string, id: string, clientContext?: Record<string, unknown>) => request<{ ok: boolean; acceptedAt: string; agreementVersion: string; agreementHash: string }>(`/api/loans/${id}/agreement/accept`, { method: "POST", headers: auth(token), body: JSON.stringify({ clientContext }) }),
  acceptLoan: (token: string, id: string) => request<{ application: LoanApplication; disbursement?: { status: string; reference: string; uuid?: string; message?: string } }>(`/api/loans/${id}/accept`, { method: "POST", headers: auth(token) }),
  compliance: () => request<Compliance>("/api/compliance"),
  creditScore: (token: string) => request<CreditScore>("/api/credit/score", { headers: auth(token) }),
  quoteLoan: (token: string, amount: number, termDays: number) => request<LoanQuote>("/api/loans/quote", { method: "POST", headers: auth(token), body: JSON.stringify({ amount, termDays }) }),
  topupWallet: (token: string, amount: number) => request<{ balance: number }>("/api/wallet/topup", { method: "POST", headers: auth(token), body: JSON.stringify({ amount }) }),
  getTransactions: (token: string) => request<{ transactions: Array<Record<string, unknown>> }>("/api/transactions", { headers: auth(token) }),
  getRepayment: (token: string) => request<{ repayment: null | (Record<string, unknown> & { collection: { stage: string; label: string; daysToDue: number } }) }>("/api/loans/repayment", { headers: auth(token) }),
  payRepayment: (token: string, amount?: number) => request<{ repayment: Record<string, unknown>; attempt: { success: boolean; reason: string }; isPartial?: boolean; isPending?: boolean; amount?: number; reference?: string; uuid?: string; message?: string }>("/api/loans/repayment/pay", { method: "POST", headers: auth(token), body: amount !== undefined ? JSON.stringify({ amount }) : undefined }),
  requestTopUp: (token: string, body: { amount: number; term_days: number; purpose: string; disbursement_method: string }) => request<{ success?: boolean; reason?: string; code?: string }>("/api/loans/top-up", { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  getNotifications: (token: string) => request<{ notifications: AppNotification[] }>("/api/notifications", { headers: auth(token) }),
  markNotificationRead: (token: string, id: string) => request<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST", headers: auth(token) }),
  markAllNotificationsRead: (token: string) => request<{ ok: true }>("/api/notifications/read-all", { method: "POST", headers: auth(token) }),
  getAdminStats: (token: string) => request<AdminStats>("/api/admin/stats", { headers: auth(token) }),
  getCustomers: (token: string) => request<{ customers: CustomerRow[] }>("/api/admin/customers", { headers: auth(token) }),
  getInvestorReport: (token: string) => request<InvestorReport>("/api/admin/investor-report", { headers: auth(token) }),
  getCreditOperationsDashboard: (token: string) => request<{ level: number; role: string; counts: Record<string, number>; queue: Array<Record<string, unknown>> }>("/api/operations/dashboard", { headers: auth(token) }),
  assignCreditApplication: (token: string, applicationId: string, assigneeId: string, level: number) => request<{ ok: boolean; level: number; assignee: Record<string, unknown> }>(`/api/operations/applications/${applicationId}/assign`, { method: "POST", headers: auth(token), body: JSON.stringify({ assigneeId, level }) }),
  getCreditCase: (token: string, applicationId: string) => request<Record<string, unknown>>(`/api/operations/applications/${applicationId}`, { headers: auth(token) }),
  saveFieldEvaluation: (token: string, applicationId: string, body: Record<string, unknown>) => request<{ ok: boolean; evaluationId: string; version: number }>(`/api/operations/applications/${applicationId}/evaluation`, { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  uploadFieldEvidence: (token: string, applicationId: string, body: { evidenceType: string; dataUrl: string; gpsLatitude?: number | null; gpsLongitude?: number | null; capturedAt?: string | null }) => request<{ evidence: Record<string, unknown> }>(`/api/operations/applications/${applicationId}/evidence`, { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  submitCreditReview: (token: string, applicationId: string, body: { narrative: string; nextAssigneeId: string; recommendedAmount?: number; recommendedTermDays?: number }) => request<{ ok: boolean; fromLevel: number; toLevel: number; assignee: Record<string, unknown> }>(`/api/operations/applications/${applicationId}/submit`, { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  decideCreditReview: (token: string, applicationId: string, body: { action: "return" | "reject" | "approve"; narrative: string; returnToLevel?: number; assigneeId?: string; recommendedAmount?: number; recommendedTermDays?: number }) => request<{ ok: boolean; status: string; canonicalDecisionRequired?: boolean; canonicalEndpoint?: string }>(`/api/operations/applications/${applicationId}/decision`, { method: "POST", headers: auth(token), body: JSON.stringify(body) }),
  getApplicationThread: (token: string, applicationId: string) => request<{ messages: Array<Record<string, unknown>> }>(`/api/operations/applications/${applicationId}/messages`, { headers: auth(token) }),
  postApplicationMessage: (token: string, applicationId: string, content: string, recipientId?: string, messageType: "internal" | "customer" = "internal") => request<{ message: Record<string, unknown> }>(`/api/operations/applications/${applicationId}/messages`, { method: "POST", headers: auth(token), body: JSON.stringify({ content, recipientId, messageType }) }),
  searchCreditOperations: (token: string, q: string) => request<{ customers: Array<Record<string, unknown>>; applications: Array<Record<string, unknown>>; businesses: Array<Record<string, unknown>> }>(`/api/operations/search${query({ q })}`, { headers: auth(token) }),
  getCustomer360: (token: string, customerId: string) => request<Record<string, unknown>>(`/api/operations/customers/${customerId}/360`, { headers: auth(token) }),
  getFieldEvidenceAccess: (token: string, evidenceId: string) => request<{ url?: string; expiresInSeconds?: number }>(`/api/operations/evidence/${evidenceId}/access`, { headers: auth(token) }),
};

export const api = nodeApi;
