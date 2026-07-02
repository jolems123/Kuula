/**
 * Row → API shape converters. The frontend `SessionPayload` and other types
 * (src/app/api/types.ts in the React app) define the wire contract; this file
 * maps our Postgres rows into those shapes so the frontend doesn't need any
 * changes.
 *
 * Money stored as BIGINT cents in DB → emitted as whole UGX (Number) in JSON.
 */
import type { UserProfile, CreditProfile, LoanProfile, Message } from "./types.js";

interface UserRow {
  id: string;
  role: "user" | "admin";
  full_name: string;
  initials: string;
  phone: string;
  email: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  district: string;
  occupation: string;
  member_since: string;
  verified: boolean;
  avatar_url: string | null;
}

export function serializeUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    role: row.role,
    initials: row.initials,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    nationalId: row.national_id ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    district: row.district,
    occupation: row.occupation,
    memberSince: row.member_since,
    verified: row.verified,
    avatarUrl: row.avatar_url,
  };
}

interface CreditScoreRow {
  score: number;
  max_score: number;
  tier: string;
  percentile: number;
}

export function serializeCredit(row: CreditScoreRow, improvementSinceStart = 0): CreditProfile {
  return {
    score: row.score,
    maxScore: row.max_score,
    tier: row.tier as CreditProfile["tier"],
    percentile: row.percentile,
    improvementSinceStart,
  };
}

interface ApplicationRow {
  id: string;
  applicant_id: string;
  applicant_name: string;
  amount: number;
  purpose: string;
  term_days: number;
  channel: string;
  pricing: unknown;
  status: string;
  decided_at: Date | null;
  decision_notes: string | null;
  loan_id: string | null;
  disbursement_id: string | null;
  created_at: Date;
}

export function serializeLoanProfile(opts: {
  availableCredit: number;
  creditIncreaseFromLastMonth: number;
  totalLoansCount: number;
  totalLoansRepaid: number;
  activeLoan?: {
    id: string;
    amount: number;
    repaidPercent: number;
    status: string;
    disbursedDate: string;
  } | null;
  nextPayment?: {
    amount: number;
    dueDate: string;
    daysLeft: number;
  } | null;
}): LoanProfile {
  return {
    availableCredit: opts.availableCredit,
    creditIncreaseFromLastMonth: opts.creditIncreaseFromLastMonth,
    totalLoansCount: opts.totalLoansCount,
    activeLoan: opts.activeLoan ?? null,
    nextPayment: opts.nextPayment ?? null,
  };
}

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: Date;
}

export function serializeMessage(row: MessageRow): Message {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    isRead: row.is_read,
  };
}

interface ApplicationApiShape {
  id: string;
  applicantId: string;
  applicantName: string;
  amount: number;
  purpose: string;
  termDays: number;
  channel: string;
  pricing: unknown;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
  loanId: string | null;
  disbursementId: string | null;
}

export function serializeApplication(row: ApplicationRow): ApplicationApiShape {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    amount: row.amount,
    purpose: row.purpose,
    termDays: row.term_days,
    channel: row.channel,
    pricing: row.pricing,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    decisionNotes: row.decision_notes,
    loanId: row.loan_id,
    disbursementId: row.disbursement_id,
  };
}

interface TransactionRow {
  id: string;
  user_id: string;
  loan_id: string | null;
  type: string;
  amount: number;
  status: string;
  transaction_id: string | null;
  metadata: unknown;
  created_at: Date;
}

export function serializeTransaction(row: TransactionRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    loanId: row.loan_id,
    type: row.type,
    amount: row.amount,
    status: row.status,
    transactionId: row.transaction_id,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}
