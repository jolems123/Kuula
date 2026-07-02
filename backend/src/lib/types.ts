/**
 * Wire types that match src/app/api/types.ts and src/app/context/AppContext.tsx
 * in the React frontend. Backend → frontend contract; do NOT change without
 * bumping both sides.
 */
export type Role = "user" | "admin";

export interface UserProfile {
  id: string;
  role: Role;
  initials: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationalId: string;
  dateOfBirth: string;
  district: string;
  occupation: string;
  memberSince: string;
  verified: boolean;
  avatarUrl: string | null;
}

export interface CreditProfile {
  score: number;
  maxScore: number;
  tier: "Poor" | "Fair" | "Good" | "Very Good" | "Excellent";
  percentile: number;
  improvementSinceStart: number;
}

export interface LoanProfile {
  availableCredit: number;
  creditIncreaseFromLastMonth: number;
  totalLoansCount: number;
  activeLoan: {
    id: string;
    amount: number;
    repaidPercent: number;
    status: string;
    disbursedDate: string;
  } | null;
  nextPayment: {
    amount: number;
    dueDate: string;
    daysLeft: number;
  } | null;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
}

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
  status: "pending" | "approved" | "rejected";
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
