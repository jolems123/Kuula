/**
 * Shared backend API types.
 */
import type { UserProfile, CreditProfile, LoanProfile, Message, Role } from "../context/AppContext";

export interface SessionPayload {
  token: string;
  refreshToken: string;
  role: Role;
  user: UserProfile;
  credit: CreditProfile | null;
  loan: LoanProfile | null;
  savingsBalance: number;
  messages: Message[];
  unreadNotifications: number;
}

export interface LoanApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  amount: number;
  purpose: string;
  termDays: number;
  channel: string;
  status: "pending" | "offered" | "disbursing" | "approved" | "rejected" | "active" | "paid" | "overdue" | "failed";
  total: number;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export interface LoanQuote {
  principal: number;
  termDays: number;
  apr: number;
  aprPercent: number;
  monthlyRatePercent: number;
  interest: number;
  fee: number;
  total: number;
  savingsDiscountApplied: boolean;
  compound: boolean;
}

export interface CreditScore {
  score: number;
  maxScore: number;
  tier: string;
  percentile: number;
  factors: Array<{
    key: string;
    label: string;
    detail: string;
    weightPercent: number;
    contribution: number;
    ratingPercent: number;
  }>;
}

export interface Compliance {
  maxAprPercent: number;
  appleAprCapPercent: number;
  minTermDays: number;
  googleMinTermDays: number;
  savingsAprPercent: number;
  savingsDiscountPercent: number;
  savingsThreshold: number;
  compound: boolean;
  dataRetentionYears: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}
