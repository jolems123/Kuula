/**
 * Shared helpers for the admin API modules.
 */
import type { Request } from "express";
import { AppError } from "../../middleware/error-handler.js";

export const num = (v: unknown): number => Number(v) || 0;

export interface Page {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** Parses `?page=&pageSize=` with safe bounds. */
export function parsePage(req: Request, defaultSize = 25, maxSize = 100): Page {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(req.query.pageSize) || defaultSize)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: Page) {
  return { items, total, page: page.page, pageSize: page.pageSize, hasMore: page.skip + items.length < total };
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function queryStr(req: Request, key: string): string {
  const raw = req.query[key];
  return str(Array.isArray(raw) ? raw[0] : raw);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string, label = "id"): string {
  if (!UUID_RE.test(value)) throw new AppError(`Invalid ${label}`, 400);
  return value;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type RangePreset = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

export interface DateRange {
  preset: RangePreset;
  from: Date | null;
  to: Date | null;
  label: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Resolves `?range=today|week|month|quarter|year|all` or `?from=&to=` (ISO
 * dates) into an inclusive-from / exclusive-to window. Defaults to `month` so
 * a report is useful without the admin choosing anything.
 */
export function parseRange(req: Request, fallback: RangePreset = "month"): DateRange {
  const preset = (queryStr(req, "range") || "") as RangePreset;
  const fromRaw = queryStr(req, "from");
  const toRaw = queryStr(req, "to");
  const now = new Date();

  if (fromRaw || toRaw) {
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new AppError("Invalid date range", 400);
    }
    // `to` is a calendar day: include the whole of it.
    const toExclusive = to ? new Date(startOfDay(to).getTime() + 86_400_000) : null;
    return { preset: "custom", from: from ? startOfDay(from) : null, to: toExclusive, label: "Custom range" };
  }

  const p: RangePreset = ["today", "week", "month", "quarter", "year", "all"].includes(preset) ? preset : fallback;
  const today = startOfDay(now);
  switch (p) {
    case "today":
      return { preset: p, from: today, to: null, label: "Today" };
    case "week": {
      const day = (today.getDay() + 6) % 7; // Monday = 0
      return { preset: p, from: new Date(today.getTime() - day * 86_400_000), to: null, label: "This week" };
    }
    case "month":
      return { preset: p, from: new Date(now.getFullYear(), now.getMonth(), 1), to: null, label: "This month" };
    case "quarter":
      return { preset: p, from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), to: null, label: "This quarter" };
    case "year":
      return { preset: p, from: new Date(now.getFullYear(), 0, 1), to: null, label: "This year" };
    default:
      return { preset: "all", from: null, to: null, label: "All time" };
  }
}

/** Prisma `createdAt` filter for a range, or `undefined` for all-time. */
export function rangeWhere(range: DateRange, field = "createdAt"): Record<string, { gte?: Date; lt?: Date }> | undefined {
  if (!range.from && !range.to) return undefined;
  const clause: { gte?: Date; lt?: Date } = {};
  if (range.from) clause.gte = range.from;
  if (range.to) clause.lt = range.to;
  return { [field]: clause };
}

export function inRange(d: Date, range: DateRange): boolean {
  const t = d.getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t >= range.to.getTime()) return false;
  return true;
}

// ── Shared row mappers ─────────────────────────────────────────────────────

export function mapApplication(a: any) {
  return {
    id: a.id,
    applicantId: a.applicantId,
    applicantName: a.applicantName,
    amount: num(a.amount),
    purpose: a.purpose,
    termDays: a.termDays,
    channel: a.channel,
    status: a.status,
    total: num(a.total),
    interest: num(a.interest),
    serviceFee: num(a.serviceFee),
    apr: Number(a.apr ?? 0),
    disbursementMethod: a.disbursementMethod,
    dueDate: a.dueDate ?? null,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt ?? null,
    decisionNotes: a.decisionNotes ?? null,
    approvedBy: a.approvedBy ?? null,
    acceptedAt: a.acceptedAt ?? null,
    disbursedAt: a.disbursedAt ?? null,
    disbursementRef: a.disbursementRef ?? null,
    loanId: a.loanId ?? null,
  };
}

export function mapRepayment(r: any) {
  const total = num(r.total);
  const paid = num(r.amountPaid);
  return {
    id: r.id,
    loanId: r.loanId,
    userId: r.userId,
    total,
    amountPaid: paid,
    outstanding: Math.max(total - paid, 0),
    dueDate: r.dueDate,
    status: r.status,
    receiptId: r.receiptId ?? null,
    attempts: Array.isArray(r.attempts) ? r.attempts.length : 0,
    createdAt: r.createdAt,
  };
}

export function mapTransaction(t: any) {
  return {
    id: t.id,
    userId: t.userId,
    userName: t.user?.fullName ?? null,
    userPhone: t.user?.phone ?? null,
    loanId: t.loanId ?? null,
    repaymentId: t.repaymentId ?? null,
    type: t.type,
    amount: num(t.amount),
    status: t.status,
    provider: t.provider ?? null,
    providerRef: t.providerRef ?? null,
    reference: t.reference ?? t.transactionId ?? null,
    failureReason: t.failureReason ?? null,
    settledAt: t.settledAt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Derived, single source of truth for a customer's KYC state. */
export function kycStatusOf(u: {
  kycVerified: boolean;
  kycSubmittedAt: Date | null;
  kycReviewStatus: string | null;
}): "verified" | "rejected" | "pending" | "not_submitted" {
  if (u.kycVerified) return "verified";
  if (u.kycReviewStatus === "rejected") return "rejected";
  if (u.kycSubmittedAt) return "pending";
  return "not_submitted";
}

export function mapCustomer(c: any) {
  return {
    id: c.id,
    fullName: c.fullName,
    phone: c.phone ?? null,
    email: c.email ?? null,
    district: c.district ?? "",
    occupation: c.occupation ?? "",
    verified: !!c.verified,
    phoneVerified: !!c.phoneVerified,
    kycVerified: !!c.kycVerified,
    kycStatus: kycStatusOf(c),
    kycSubmittedAt: c.kycSubmittedAt ?? null,
    loansTotal: c.loansTotal ?? 0,
    loansRepaid: c.loansRepaid ?? 0,
    active: !c.deletedAt,
    deactivatedAt: c.deletedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function mapAudit(e: any, actorName?: string | null) {
  return {
    id: e.id,
    actorId: e.actorId ?? null,
    actorRole: e.actorRole ?? null,
    actorName: actorName ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata ?? {},
    createdAt: e.createdAt,
  };
}

/** Resolves actor display names for a batch of audit events in one query. */
export async function withActorNames<T extends { actorId: string | null }>(
  prisma: { user: { findMany: (args: any) => Promise<Array<{ id: string; fullName: string; email: string | null }>> } },
  events: T[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(events.map((e) => e.actorId).filter((v): v is string => !!v)));
  if (ids.length === 0) return new Map();
  const actors = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } });
  return new Map(actors.map((a) => [a.id, a.fullName || a.email || a.id]));
}
