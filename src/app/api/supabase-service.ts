/**
 * Supabase implementation of the backend API.
 *
 * Exposes the same surface as the Node client (src/app/api/client.ts) so the
 * app can switch backends with VITE_BACKEND=supabase and nothing else changes.
 * Data access goes straight to Postgres under Row-Level Security; privileged
 * work (credit scoring, loan disbursement, auto-collection) is handled by
 * Edge Functions / DB triggers, never with a service key in the browser.
 */
import { requireSupabase } from "../lib/supabase";
import { localQuote } from "../lib/pricing";
import type { UserProfile, CreditProfile, LoanProfile, Message, Role } from "../context/AppContext";
import {
  ApiError,
  type SessionPayload, type LoanApplication, type LoanQuote,
  type CreditScore, type Compliance,
} from "./types";

const COMPLIANCE: Compliance = {
  maxAprPercent: 33.6, appleAprCapPercent: 36, minTermDays: 90, googleMinTermDays: 61,
  savingsAprPercent: 5, savingsDiscountPercent: 5, savingsThreshold: 100000,
  compound: false, dataRetentionYears: 10,
};

const normalizePhone = (p: string) => String(p ?? "").replace(/[\s-]/g, "");
const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Pull the JSON `error` message out of a failed Edge Function (FunctionsHttpError)
// so callers see "Borrower has no phone number" instead of "non-2xx status code".
async function fnErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch { /* ignore parse errors */ }
  return (error as Error)?.message || fallback;
}

let cachedAdminId: string | null = null;
let cachedRole: "user" | "admin" | null = null;
const isAdminSession = () => cachedRole === "admin";

async function adminId(): Promise<string> {
  if (cachedAdminId) return cachedAdminId;
  const sb = requireSupabase();
  const { data } = await sb.from("profiles").select("id").eq("role", "admin").limit(1).single();
  const id: string = data?.id ?? "";
  cachedAdminId = id;
  return id;
}

interface ProfileRow {
  id: string; role: Role; full_name: string; phone: string | null; email: string | null;
  national_id: string | null; district: string | null; occupation: string | null; verified: boolean;
  loans_total: number; loans_repaid: number; created_at: string;
}

function toUserProfile(p: ProfileRow): UserProfile {
  return {
    id: p.id, role: p.role, initials: initialsOf(p.full_name || "Kuula User"),
    fullName: p.full_name, phone: p.phone ?? "", email: p.email,
    nationalId: p.national_id ?? "", dateOfBirth: "", district: p.district ?? "",
    occupation: p.occupation ?? "", memberSince: "", verified: p.verified, avatarUrl: null,
  };
}

async function buildSession(token: string): Promise<SessionPayload> {
  const sb = requireSupabase();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new ApiError("Not authenticated", 401);

  const { data: p } = await sb.from("profiles").select("*").eq("id", uid).single();
  if (!p) throw new ApiError("Profile not found", 404);
  const isAdmin = p.role === "admin";
  cachedRole = isAdmin ? "admin" : "user";

  const { data: sav } = await sb.from("savings_accounts").select("balance").eq("user_id", uid).single();
  const { data: msgs } = await sb.from("messages").select("*").order("created_at", { ascending: true });
  const { count: unreadCount } = await sb.from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid).eq("is_read", false);

  let credit: CreditProfile | null = null;
  if (!isAdmin) {
    try {
      const { data } = await sb.functions.invoke<CreditScore>("credit-score");
      if (data) credit = { score: data.score, maxScore: data.maxScore, tier: data.tier as CreditProfile["tier"], percentile: data.percentile, improvementSinceStart: 0 };
    } catch { /* score is optional for session bootstrap */ }
  }

  let loan: LoanProfile | null = null;
  if (!isAdmin) {
    const [{ data: activeApp }, { data: nextRep }] = await Promise.all([
      sb.from("loan_applications")
        .select("id, loan_id, amount, status, created_at, decided_at")
        .eq("applicant_id", uid)
        .in("status", ["approved", "active"])
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("repayments")
        .select("*")
        .eq("user_id", uid)
        .neq("status", "paid")
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const totalCount = Number((p as ProfileRow).loans_total ?? 0);

    loan = {
      // Fail safe: there is no server-owned credit-limit source yet, so we do NOT
      // fabricate a borrowing limit. 0 = "no pre-approved credit" until the
      // backend exposes a real, underwritten limit (Edge Function / persisted
      // column). Showing a fixed figure here would be fabricated financial data.
      availableCredit: 0,
      creditIncreaseFromLastMonth: 0,
      totalLoansCount: totalCount,
      activeLoan: activeApp
        ? {
            id: activeApp.loan_id || activeApp.id,
            amount: Number(activeApp.amount),
            repaidPercent: nextRep
              ? Math.round(((nextRep.amount_paid ?? 0) / (nextRep.total || 1)) * 100)
              : 0,
            status: activeApp.status,
            disbursedDate: activeApp.decided_at
              ? new Date(activeApp.decided_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : new Date(activeApp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          }
        : null,
      nextPayment: nextRep
        ? {
            amount: Number(nextRep.total) - Number(nextRep.amount_paid),
            dueDate: new Date(nextRep.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            daysLeft: Math.max(0, Math.ceil((new Date(nextRep.due_date).getTime() - Date.now()) / 86400000)),
          }
        : null,
    };
  }

  return {
    token, refreshToken: "", role: p.role, user: toUserProfile(p as ProfileRow),
    credit, loan,
    savingsBalance: isAdmin ? 0 : (sav?.balance ?? 0),
    messages: (msgs ?? []).map(mapMessage),
    unreadNotifications: unreadCount ?? 0,
  };
}

function mapMessage(m: { id: string; sender_id: string; receiver_id: string; content: string; is_read: boolean; created_at: string }): Message {
  return { id: m.id, senderId: m.sender_id, receiverId: m.receiver_id, content: m.content, isRead: m.is_read, createdAt: m.created_at };
}

function mapApplication(a: Record<string, unknown>): LoanApplication {
  return {
    id: String(a.id), applicantId: String(a.applicant_id), applicantName: String(a.applicant_name ?? ""),
    amount: Number(a.amount), purpose: String(a.purpose), termDays: Number(a.term_days),
    channel: String(a.channel), status: a.status as LoanApplication["status"],
    total: Number(a.total ?? 0),
    createdAt: String(a.created_at), decidedAt: (a.decided_at as string) ?? null,
    decisionNotes: (a.decision_notes as string) ?? null,
  };
}

async function accessToken(): Promise<string> {
  const sb = requireSupabase();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? "";
}

// ── Goal types ────────────────────────────────────────────────────────────────
export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  target: number;
  saved: number;
  color: string;
  created_at: string;
  updated_at: string;
}

// ── Notification types ────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "success" | "warning" | "info" | "alert";
  is_read: boolean;
  created_at: string;
}

// ── Admin stats type ──────────────────────────────────────────────────────────
export interface AdminStats {
  totalCustomers: number;
  pendingApprovals: number;
  overdueLoans: number;
  recentApplications: LoanApplication[];
  monthlyChart: { month: string; loans: number; amount: number }[];
}

export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  verified: boolean;
  loans_total: number;
  created_at: string;
}

// ── Investor report type ──────────────────────────────────────────────────────
// Every field below is computed from real rows in Postgres (no hardcoded values).
export interface InvestorReport {
  generatedAt: string;
  customers: { total: number; verified: number; newThisMonth: number };
  loans: {
    total: number; pending: number; active: number; paid: number;
    overdue: number; rejected: number;
    disbursedPrincipal: number; outstanding: number;
  };
  revenue: {
    totalDisbursed: number; totalCollected: number;
    realizedInterest: number; expectedInterest: number;
  };
  savings: { total: number; accounts: number; deposits: number; withdrawals: number };
  ratios: { defaultRatePct: number; repaymentRatePct: number; parPct: number };
  monthly: { month: string; disbursed: number; collected: number; newCustomers: number }[];
  today: { applications: number; approved: number; rejected: number; disbursed: number; collected: number };
  daily: { day: string; applications: number; approved: number; disbursed: number; collected: number }[];
}

export const supabaseApi = {
  health: async () => ({ ok: true }),

  login: async (phone: string, pin: string): Promise<SessionPayload> => {
    const sb = requireSupabase();
    const { error } = await sb.auth.signInWithPassword({ phone: normalizePhone(phone), password: pin });
    if (error) throw new ApiError("Invalid phone number or PIN", 401);
    return buildSession(await accessToken());
  },

  adminLogin: async (email: string, password: string): Promise<SessionPayload> => {
    const sb = requireSupabase();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new ApiError("Invalid credentials", 401);
    return buildSession(await accessToken());
  },

  signUp: async (input: { name: string; phone: string; email: string; password: string; nationalId: string }) => {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({
      phone: normalizePhone(input.phone),
      password: input.password,
      options: { data: { full_name: input.name, role: "user", email: input.email } },
    });
    if (error) throw new ApiError(error.message, 400);
    if (data.user) {
      await sb.from("profiles").update({ national_id: input.nationalId, email: input.email }).eq("id", data.user.id);
    }
    return { ok: true as const, needsConfirmation: !data.session };
  },

  signOut: async () => {
    cachedRole = null;
    cachedAdminId = null;
    await requireSupabase().auth.signOut();
  },

  resetPassword: async (email: string) => {
    const sb = requireSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw new ApiError(error.message, 400);
    return { ok: true as const };
  },

  // Confirm the phone number with the SMS OTP Supabase sent via Twilio. On
  // success the user's session is live, so we hydrate and return it.
  verifyPhone: async (phone: string, code: string): Promise<SessionPayload> => {
    if (!/^\d{6}$/.test(code)) throw new ApiError("Enter the 6-digit code", 400);
    const sb = requireSupabase();
    const { error } = await sb.auth.verifyOtp({ phone: normalizePhone(phone), token: code, type: "sms" });
    if (error) throw new ApiError(error.message || "Invalid or expired code", 401);
    return buildSession(await accessToken());
  },

  // Re-send the SMS OTP (e.g. the first one expired or never arrived).
  resendOtp: async (phone: string) => {
    const sb = requireSupabase();
    const { error } = await sb.auth.resend({ type: "sms", phone: normalizePhone(phone) });
    if (error) throw new ApiError(error.message, 400);
    return { ok: true as const };
  },

  me: async (token: string) => buildSession(token),

  compliance: async (): Promise<Compliance> => COMPLIANCE,

  creditScore: async (_token: string): Promise<CreditScore> => {
    const sb = requireSupabase();
    const { data, error } = await sb.functions.invoke<CreditScore>("credit-score");
    if (error || !data) throw new ApiError("Could not compute credit score", 502);
    return data;
  },

  quoteLoan: async (_token: string, amount: number, termDays: number): Promise<LoanQuote> => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const { data: sav } = await sb.from("savings_accounts").select("balance").eq("user_id", auth.user?.id ?? "").single();
    return localQuote(amount, termDays, sav?.balance ?? 0);
  },

  getMessages: async (_token: string) => {
    const sb = requireSupabase();
    let q = sb.from("messages").select("*").order("created_at", { ascending: true });
    if (!isAdminSession()) {
      const { data: auth } = await sb.auth.getUser();
      const uid = auth.user?.id ?? "";
      q = q.or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
    }
    const { data, error } = await q;
    if (error) throw new ApiError(error.message, 500);
    return { messages: (data ?? []).map(mapMessage) };
  },

  postMessage: async (_token: string, content: string, receiverId?: string) => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const me = auth.user?.id;
    const to = receiverId || (await adminId());
    const { data, error } = await sb.from("messages")
      .insert({ sender_id: me, receiver_id: to, content }).select().single();
    if (error) throw new ApiError(error.message, 400);
    return { message: mapMessage(data) };
  },

  getApplications: async (_token: string) => {
    const sb = requireSupabase();
    let q = sb.from("loan_applications").select("*").order("created_at", { ascending: false });
    if (!isAdminSession()) {
      const { data: auth } = await sb.auth.getUser();
      q = q.eq("applicant_id", auth.user?.id ?? "");
    }
    const { data, error } = await q;
    if (error) throw new ApiError(error.message, 500);
    return { applications: (data ?? []).map(mapApplication) };
  },

  getTransactions: async (_token: string) => {
    const sb = requireSupabase();
    let q = sb.from("transactions").select("*").order("created_at", { ascending: false }).limit(50);
    if (!isAdminSession()) {
      const { data: auth } = await sb.auth.getUser();
      q = q.eq("user_id", auth.user?.id ?? "");
    }
    const { data, error } = await q;
    if (error) throw new ApiError(error.message, 500);
    return { transactions: data ?? [] };
  },

  submitApplication: async (
    _token: string,
    body: { amount: number; purpose: string; termDays: number; channel?: string }
  ) => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    const { data: prof } = await sb.from("profiles").select("full_name").eq("id", uid ?? "").single();
    const { data: sav } = await sb.from("savings_accounts").select("balance").eq("user_id", uid ?? "").single();
    const q = localQuote(body.amount, body.termDays, sav?.balance ?? 0);
    const { data, error } = await sb.from("loan_applications").insert({
      applicant_id: uid, applicant_name: prof?.full_name ?? "", amount: body.amount,
      purpose: body.purpose, term_days: q.termDays, channel: body.channel ?? "MTN MoMo",
      apr: q.apr, interest: q.interest, total: q.total,
    }).select().single();
    if (error) throw new ApiError(error.message, 400);
    return { application: mapApplication(data) };
  },

  decideApplication: async (_token: string, id: string, decision: "approved" | "rejected", notes = "") => {
    const sb = requireSupabase();
    // Approving a loan makes it an OFFER — no money moves yet. The borrower must
    // open the loan agreement and accept it (acceptLoan), which is the only step
    // that triggers the real MarzPay disbursement. Rejection is a status update.
    const status = decision === "approved" ? "offered" : "rejected";
    const { data, error } = await sb.from("loan_applications")
      .update({ status, decision_notes: notes, decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending").select().single();
    if (error) throw new ApiError(error.message, 400);
    return { application: mapApplication(data) };
  },

  // Borrower accepts an approved loan offer. This is the ONLY action that moves
  // real money: marzpay-disburse verifies the caller is the borrower, sends the
  // principal to their mobile money via MarzPay, then books the loan.
  acceptLoan: async (_token: string, id: string) => {
    const sb = requireSupabase();
    const { data, error } = await sb.functions.invoke<{ application: Record<string, unknown> }>(
      "marzpay-disburse", { body: { applicationId: id } },
    );
    if (error) throw new ApiError(await fnErrorMessage(error, "Disbursement failed"), 502);
    if (!data?.application) throw new ApiError("Disbursement returned no application", 502);
    return { application: mapApplication(data.application) };
  },

  getSavings: async (_token: string) => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const { data } = await sb.from("savings_accounts").select("balance").eq("user_id", auth.user?.id ?? "").single();
    return { balance: data?.balance ?? 0, accruedInterest: 0, aprPercent: COMPLIANCE.savingsAprPercent };
  },

  depositSavings: async (_token: string, amount: number) => adjustSavings(amount),
  withdrawSavings: async (_token: string, amount: number) => adjustSavings(-amount),

  topupWallet: async (_token: string, _amount: number): Promise<{ balance: number }> => {
    // The topup_wallet RPC is revoked in production (migration 0006): it minted
    // wallet balance with no real payment behind it, and that balance could
    // settle real loans. Money enters the system only via MarzPay collections.
    throw new ApiError("Wallet top-ups are made from your mobile money when a payment is collected.", 400);
  },

  getRepayment: async (_token: string) => {
    const sb = requireSupabase();
    const { data } = await sb.from("repayments").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return { repayment: null };
    const daysToDue = Math.ceil((new Date(data.due_date).getTime() - Date.now()) / 86400000);
    return { repayment: { ...data, collection: { stage: data.status === "paid" ? "paid" : "scheduled", label: data.status === "paid" ? "Repaid" : `Due in ${daysToDue} days`, daysToDue } } };
  },

  payRepayment: async (_token: string, amount?: number) => {
    const sb = requireSupabase();
    // Real money: marzpay-collect sends a MarzPay collection (request-to-pay) to
    // the customer's phone. They approve the prompt and marzpay-webhook settles
    // the ledger. This call only STARTS the collection and returns a pending
    // status — the loan is never marked paid here.
    const { data, error } = await sb.functions.invoke<{
      status: string; uuid?: string; amount?: number; reference?: string; message?: string; reason?: string;
    }>("marzpay-collect", { body: amount !== undefined ? { amount: Math.round(amount) } : {} });
    if (error) throw new ApiError(await fnErrorMessage(error, "Collection failed"), 502);
    const res = data ?? { status: "failed" };
    return {
      status: res.status,
      message: res.message ?? "",
      uuid: res.uuid,
      reference: res.reference,
      amount: res.amount,
      // Pending until the customer approves on their phone and the webhook lands.
      isPending: res.status === "pending",
    };
  },

  requestTopUp: async (_token: string, body: { amount: number; term_days: number; purpose: string; disbursement_method: string }) => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    const { data, error } = await sb.functions.invoke("loan-top-up", { body: { user_id: uid, ...body } });
    if (error) throw new ApiError(error.message, 502);
    return (data ?? { success: false, reason: "Edge function not deployed" }) as { success: boolean; loan_id?: string; status?: string; reason?: string; pricing?: Record<string, unknown> };
  },

  deleteAccount: async (_token: string) => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    const { error } = await sb.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", uid);
    if (error) throw new ApiError(error.message, 400); // deletion must not silently no-op (Apple 5.1.1(v))
    await sb.auth.signOut();
    return { ok: true as const };
  },

  // ── Savings goals ──────────────────────────────────────────────────────────
  getGoals: async (_token: string): Promise<{ goals: SavingsGoal[] }> => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    const { data, error } = await sb.from("savings_goals").select("*").eq("user_id", uid).order("created_at", { ascending: true });
    if (error) throw new ApiError(error.message, 500);
    return { goals: (data ?? []) as SavingsGoal[] };
  },

  createGoal: async (_token: string, body: { name: string; emoji: string; target: number; color?: string }): Promise<{ goal: SavingsGoal }> => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    const { data, error } = await sb.from("savings_goals")
      .insert({ user_id: uid, name: body.name, emoji: body.emoji, target: body.target, color: body.color ?? "#FF6B35" })
      .select().single();
    if (error) throw new ApiError(error.message, 400);
    return { goal: data as SavingsGoal };
  },

  updateGoal: async (_token: string, id: string, patch: Partial<Pick<SavingsGoal, "saved" | "name" | "emoji" | "target" | "color">>): Promise<{ goal: SavingsGoal }> => {
    const sb = requireSupabase();
    const { data, error } = await sb.from("savings_goals")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new ApiError(error.message, 400);
    return { goal: data as SavingsGoal };
  },

  deleteGoal: async (_token: string, id: string): Promise<{ ok: true }> => {
    const sb = requireSupabase();
    const { error } = await sb.from("savings_goals").delete().eq("id", id);
    if (error) throw new ApiError(error.message, 400);
    return { ok: true };
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  getNotifications: async (_token: string): Promise<{ notifications: AppNotification[] }> => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    const { data, error } = await sb.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (error) throw new ApiError(error.message, 500);
    return { notifications: (data ?? []) as AppNotification[] };
  },

  markNotificationRead: async (_token: string, id: string): Promise<{ ok: true }> => {
    const sb = requireSupabase();
    await sb.from("notifications").update({ is_read: true }).eq("id", id);
    return { ok: true };
  },

  markAllNotificationsRead: async (_token: string): Promise<{ ok: true }> => {
    const sb = requireSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? "";
    await sb.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
    return { ok: true };
  },

  // ── Admin: stats for dashboard ─────────────────────────────────────────────
  getAdminStats: async (_token: string): Promise<AdminStats> => {
    const sb = requireSupabase();
    const [
      { count: customerCount },
      { count: pendingCount },
      { count: overdueCount },
      { data: recentApps },
      { data: allRecent },
    ] = await Promise.all([
      sb.from("profiles").select("*", { count: "exact", head: true }).eq("role", "user"),
      sb.from("loan_applications").select("*", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("loan_applications").select("*", { count: "exact", head: true }).eq("status", "overdue"),
      sb.from("loan_applications").select("id, applicant_name, amount, purpose, status, created_at, decided_at, decision_notes, applicant_id, term_days, channel")
        .order("created_at", { ascending: false }).limit(5),
      sb.from("loan_applications").select("created_at, amount")
        .gte("created_at", new Date(Date.now() - 180 * 86400000).toISOString())
        .order("created_at", { ascending: true }),
    ]);

    const monthMap: Record<string, { loans: number; amount: number }> = {};
    for (const row of allRecent ?? []) {
      const month = new Date(row.created_at).toLocaleString("en-US", { month: "short" });
      if (!monthMap[month]) monthMap[month] = { loans: 0, amount: 0 };
      monthMap[month].loans += 1;
      monthMap[month].amount += Math.round(Number(row.amount) / 1_000_000);
    }
    const monthlyChart = Object.entries(monthMap).map(([month, v]) => ({ month, ...v }));

    return {
      totalCustomers: customerCount ?? 0,
      pendingApprovals: pendingCount ?? 0,
      overdueLoans: overdueCount ?? 0,
      recentApplications: (recentApps ?? []).map(mapApplication),
      monthlyChart,
    };
  },

  // ── Admin: full customer list ──────────────────────────────────────────────
  getCustomers: async (_token: string): Promise<{ customers: CustomerRow[] }> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("profiles")
      .select("id, full_name, phone, email, verified, loans_total, created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false });
    if (error) throw new ApiError(error.message, 500);
    return { customers: (data ?? []) as CustomerRow[] };
  },

  // ── Admin: savings overview ────────────────────────────────────────────────
  getSavingsOverview: async (_token: string): Promise<{ accounts: { user_id: string; full_name: string; balance: number }[]; total: number }> => {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("savings_accounts")
      .select("user_id, balance, profiles(full_name)")
      .order("balance", { ascending: false })
      .limit(50);
    if (error) throw new ApiError(error.message, 500);
    const accounts = (data ?? []).map((r: Record<string, unknown>) => ({
      user_id: String(r.user_id),
      full_name: String((r.profiles as Record<string, unknown>)?.full_name ?? ""),
      balance: Number(r.balance),
    }));
    const total = accounts.reduce((s, a) => s + a.balance, 0);
    return { accounts, total };
  },

  // ── Admin: full investor report (all metrics computed from real rows) ───────
  getInvestorReport: async (_token: string): Promise<InvestorReport> => {
    const sb = requireSupabase();
    const [
      { data: txns, error: txErr },
      { data: apps, error: appErr },
      { data: reps, error: repErr },
      { data: savings, error: savErr },
      { data: profileRows, error: profErr },
    ] = await Promise.all([
      sb.from("transactions").select("type, amount, status, created_at"),
      sb.from("loan_applications").select("amount, interest, status, created_at"),
      sb.from("repayments").select("total, amount_paid, status"),
      sb.from("savings_accounts").select("balance"),
      sb.from("profiles").select("verified, created_at").eq("role", "user"),
    ]);
    const firstErr = txErr || appErr || repErr || savErr || profErr;
    if (firstErr) throw new ApiError(firstErr.message, 500);

    const num = (v: unknown) => Number(v) || 0;
    const completed = (txns ?? []).filter((t) => t.status === "completed");
    const sumTx = (type: string) =>
      completed.filter((t) => t.type === type).reduce((s, t) => s + num(t.amount), 0);

    const totalDisbursed = sumTx("loan_disbursement");
    const totalCollected = sumTx("loan_payment");
    const savingsDeposits = sumTx("savings_deposit");
    const savingsWithdrawals = sumTx("savings_withdrawal");

    const allApps = apps ?? [];
    const countBy = (s: string) => allApps.filter((a) => a.status === s).length;
    const pending = countBy("pending");
    const approved = countBy("approved");
    const active = countBy("active") + approved;
    const paid = countBy("paid");
    const overdue = countBy("overdue");
    const rejected = countBy("rejected");
    const bookedStatuses = ["approved", "active", "paid", "overdue"];
    const disbursedPrincipal = allApps
      .filter((a) => bookedStatuses.includes(a.status))
      .reduce((s, a) => s + num(a.amount), 0);
    const realizedInterest = allApps
      .filter((a) => a.status === "paid")
      .reduce((s, a) => s + num(a.interest), 0);
    const expectedInterest = allApps
      .filter((a) => bookedStatuses.includes(a.status))
      .reduce((s, a) => s + num(a.interest), 0);

    const outstanding = (reps ?? [])
      .filter((r) => r.status !== "paid")
      .reduce((s, r) => s + Math.max(num(r.total) - num(r.amount_paid), 0), 0);
    const parOutstanding = (reps ?? [])
      .filter((r) => r.status === "overdue")
      .reduce((s, r) => s + Math.max(num(r.total) - num(r.amount_paid), 0), 0);

    const totalSavings = (savings ?? []).reduce((s, a) => s + num(a.balance), 0);

    // Loans that have reached a terminal/active outcome (basis for default & repayment rates).
    const concludedOrLive = active + paid + overdue;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    const defaultRatePct = pct(overdue, concludedOrLive);
    const repaymentRatePct = pct(paid, concludedOrLive);
    const parPct = pct(parOutstanding, outstanding);

    // Last 12 months of activity, oldest → newest.
    const now = new Date();
    const months: { key: string; label: string; disbursed: number; collected: number; newCustomers: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        disbursed: 0, collected: 0, newCustomers: 0,
      });
    }
    const bucket = (iso: string) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return months.find((m) => m.key === key);
    };
    for (const t of completed) {
      const m = bucket(t.created_at);
      if (!m) continue;
      if (t.type === "loan_disbursement") m.disbursed += num(t.amount);
      else if (t.type === "loan_payment") m.collected += num(t.amount);
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let newThisMonth = 0;
    for (const p of profileRows ?? []) {
      const m = bucket(p.created_at);
      if (m) m.newCustomers += 1;
      if (new Date(p.created_at).getTime() >= monthStart) newThisMonth += 1;
    }

    // Today and the last 7 days, computed over the FULL ledger (authoritative).
    const dayKeyOf = (iso: string) => new Date(iso).toDateString();
    const todayKey = now.toDateString();
    const appsToday = allApps.filter((a) => dayKeyOf(a.created_at) === todayKey);
    const txToday = completed.filter((t) => dayKeyOf(t.created_at) === todayKey);
    const today = {
      applications: appsToday.length,
      approved: appsToday.filter((a) => bookedStatuses.includes(a.status)).length,
      rejected: appsToday.filter((a) => a.status === "rejected").length,
      disbursed: txToday.filter((t) => t.type === "loan_disbursement").reduce((s, t) => s + num(t.amount), 0),
      collected: txToday.filter((t) => t.type === "loan_payment").reduce((s, t) => s + num(t.amount), 0),
    };
    const dayBuckets: { key: string; day: string; applications: number; approved: number; disbursed: number; collected: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dayBuckets.push({ key: d.toDateString(), day: d.toLocaleDateString("en-US", { weekday: "short" }), applications: 0, approved: 0, disbursed: 0, collected: 0 });
    }
    const findDay = (iso: string) => dayBuckets.find((b) => b.key === dayKeyOf(iso));
    for (const a of allApps) {
      const b = findDay(a.created_at);
      if (!b) continue;
      b.applications += 1;
      if (bookedStatuses.includes(a.status)) b.approved += 1;
    }
    for (const t of completed) {
      const b = findDay(t.created_at);
      if (!b) continue;
      if (t.type === "loan_disbursement") b.disbursed += num(t.amount);
      else if (t.type === "loan_payment") b.collected += num(t.amount);
    }

    return {
      generatedAt: new Date().toISOString(),
      customers: {
        total: (profileRows ?? []).length,
        verified: (profileRows ?? []).filter((p) => p.verified).length,
        newThisMonth,
      },
      loans: {
        total: allApps.length, pending, active, paid, overdue, rejected,
        disbursedPrincipal, outstanding,
      },
      revenue: { totalDisbursed, totalCollected, realizedInterest, expectedInterest },
      savings: {
        total: totalSavings, accounts: (savings ?? []).length,
        deposits: savingsDeposits, withdrawals: savingsWithdrawals,
      },
      ratios: { defaultRatePct, repaymentRatePct, parPct },
      monthly: months.map((m) => ({
        month: m.label, disbursed: m.disbursed, collected: m.collected, newCustomers: m.newCustomers,
      })),
      today,
      daily: dayBuckets.map((b) => ({
        day: b.day, applications: b.applications, approved: b.approved, disbursed: b.disbursed, collected: b.collected,
      })),
    };
  },
};

async function adjustSavings(delta: number) {
  const sb = requireSupabase();
  // Server-authoritative: the adjust_savings RPC (SECURITY DEFINER) validates
  // the caller, enforces a non-negative resulting balance, and writes the
  // ledger row. Clients can no longer set their own savings balance directly.
  const { data, error } = await sb.rpc("adjust_savings", { p_delta: Math.round(delta) });
  if (error) throw new ApiError(error.message, 400);
  return data as { balance: number };
}
