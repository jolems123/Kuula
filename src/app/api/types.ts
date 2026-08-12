/** Shared Node API response types. */
import type { UserProfile, CreditProfile, LoanProfile, Message, Role } from "../context/AppContext";

export interface SessionPayload {
  token: string;
  refreshToken: string;
  accessExpiresInSeconds?: number;
  role: Role;
  user: UserProfile;
  credit: CreditProfile | null;
  loan: LoanProfile | null;
  savingsBalance: number;
  messages: Message[];
  unreadNotifications: number;
}

export interface AdminMfaPayload {
  requiresMfa: true;
  challengeToken: string;
  destination: string;
}

export interface LoanApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  amount: number;
  purpose: string;
  termDays: number;
  channel: string;
  status: "pending" | "resubmitted" | "offered" | "disbursing" | "approved" | "rejected" | "active" | "paid" | "overdue" | "failed";
  total: number;
  apr?: number;
  interest?: number;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
  offerExpiresAt?: string | null;
  underwritingStatus?: string | null;
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

export interface KuulaMarket {
  code: string;
  countryName: string;
  currency: string;
  dialingCode: string;
  defaultLocale?: string;
  status?: string;
}

export interface GrowthLine {
  totalLimit: number;
  availableLimit: number;
  status: "identity_required" | "data_required" | "building" | "available" | "in_use" | string;
  reviewedAt: string;
  expiresAt: string;
}

export interface CreditPass {
  score: number;
  maxScore: number;
  tier: string;
  percentile: number;
  kycLevel: string;
  repaymentRate: number;
  availableLimit?: number;
  signals: {
    identityVerified?: boolean;
    phoneVerified?: boolean;
    kycVerified?: boolean;
    mobileMoneyEvidence?: boolean;
    crbEvidence?: boolean;
    mobileMoneyMonths?: number;
    mobileMoneyTransactions?: number;
    crbStatus?: string;
    loansRepaid?: number;
    loansTotal?: number;
    [key: string]: unknown;
  };
  updatedAt: string;
}

export interface CreditProduct {
  id: string;
  code: string;
  marketCode: string;
  name: string;
  category: "business" | "health" | "agriculture" | "education" | "essentials" | string;
  purposeType: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  customerLimit: number;
  minTermDays: number;
  maxTermDays: number;
  disbursementMode: string;
  partnerRequired: boolean;
  status: string;
  metadata: Record<string, unknown>;
}

export interface KuulaPartnerLocation {
  id: string;
  name: string;
  district: string | null;
  country: string;
  phone: string | null;
  metadata: Record<string, unknown>;
}

export interface KuulaPartner {
  id: string;
  code: string;
  marketCode: string;
  name: string;
  partnerType: string;
  settlementMode: string;
  metadata: Record<string, unknown>;
  locations: KuulaPartnerLocation[];
}

export interface NetworkOverview {
  market: KuulaMarket;
  growthLine: GrowthLine;
  creditPass: CreditPass;
  products: CreditProduct[];
  partners: KuulaPartner[];
  activeFinancing: null | {
    id: string;
    purpose: string;
    amount: number;
    total: number;
    status: string;
    dueDate: string | null;
  };
  nextPayment: null | {
    amount: number;
    dueDate: string;
    status: string;
  };
  recentPartnerRequests: Array<{
    id: string;
    purpose: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
}

export interface PartnerFinancingRequestInput {
  marketCode?: string;
  productCode: string;
  partnerCode: string;
  partnerLocationId?: string | null;
  invoiceReference: string;
  purpose: string;
  amount: number;
  externalReference?: string | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}
