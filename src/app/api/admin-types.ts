/**
 * Admin API response shapes. Every field maps to a database column or an
 * aggregate computed on the server — nothing here is filled in client-side.
 */

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type LoanStatus =
  | "pending" | "resubmitted" | "offered" | "disbursing" | "active" | "paid" | "overdue"
  | "rejected" | "disbursement_failed" | "failed";

export type AdminLoan = {
  id: string;
  applicantId: string;
  applicantName: string;
  amount: number;
  purpose: string;
  termDays: number;
  channel: string;
  status: LoanStatus | string;
  total: number;
  interest: number;
  serviceFee: number;
  apr: number;
  disbursementMethod: string;
  dueDate: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
  approvedBy: string | null;
  acceptedAt: string | null;
  disbursedAt: string | null;
  disbursementRef: string | null;
  loanId: string | null;
};

export type AdminRepayment = {
  id: string;
  loanId: string;
  userId: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  dueDate: string;
  status: "scheduled" | "paid" | "overdue" | string;
  receiptId: string | null;
  attempts: number;
  createdAt: string;
};

export type AdminTransaction = {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  loanId: string | null;
  repaymentId: string | null;
  type: "loan_disbursement" | "loan_payment" | "savings_deposit" | "savings_withdrawal" | string;
  amount: number;
  status: "pending" | "completed" | "failed" | string;
  provider: string | null;
  providerRef: string | null;
  reference: string | null;
  failureReason: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KycStatus = "verified" | "rejected" | "pending" | "not_submitted";

export type AdminCustomer = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  district: string;
  occupation: string;
  verified: boolean;
  phoneVerified: boolean;
  kycVerified: boolean;
  kycStatus: KycStatus;
  kycSubmittedAt: string | null;
  loansTotal: number;
  loansRepaid: number;
  active: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditEvent = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreditScore = {
  score: number;
  maxScore: number;
  tier: string;
  percentile: number;
  factors: Array<{ key: string; label: string; detail: string; weightPercent: number; contribution: number; ratingPercent: number }>;
};

export type AdminCustomerDetail = {
  customer: AdminCustomer & {
    nationalId: string | null;
    crbStatus: string;
    momoMonths: number;
    momoTxnCount: number;
    kycProvider: string | null;
    kycReference: string | null;
    kycReviewStatus: string | null;
    kycReviewNotes: string | null;
    kycReviewedAt: string | null;
    hasKycDocuments: boolean;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
  };
  savings: { balance: number; ledgerBalance: number; reconciled: boolean; updatedAt: string } | null;
  credit: CreditScore;
  loans: AdminLoan[];
  repayments: AdminRepayment[];
  transactions: AdminTransaction[];
  tickets: Array<Pick<AdminTicket, "id" | "subject" | "status" | "priority" | "category" | "createdAt" | "updatedAt">>;
  audit: AdminAuditEvent[];
  hasLiveLoan: boolean;
};

export type AdminLoanRow = AdminLoan & {
  applicantPhone: string | null;
  applicantKycVerified: boolean;
  applicantActive: boolean;
  repayment: AdminRepayment | null;
};

export type AdminLoanDetail = {
  loan: AdminLoan & { approvedByName: string | null };
  applicant: {
    id: string; fullName: string; phone: string | null; email: string | null; kycVerified: boolean;
    loansTotal: number; loansRepaid: number; active: boolean; createdAt: string;
  } | null;
  repayments: AdminRepayment[];
  transactions: AdminTransaction[];
  audit: AdminAuditEvent[];
};

export type AdminLoanSummary = {
  counts: Record<string, number>;
  amounts: Record<string, number>;
  outstandingPortfolio: number;
  arrears: number;
};

export type AdminKycRow = AdminCustomer & {
  nationalId: string | null;
  kycProvider: string | null;
  kycReference: string | null;
  kycReviewStatus: string | null;
  kycReviewNotes: string | null;
  kycReviewedAt: string | null;
  kycReviewedBy: string | null;
  documents: { front: boolean; back: boolean };
};

export type AdminKycDetail = {
  kyc: AdminKycRow & { reviewedByName: string | null };
  history: AdminAuditEvent[];
};

export type AdminKycDocuments = {
  front: string | null;
  back: string | null;
  missing: { front: boolean; back: boolean };
};

export type AdminSavingsAccount = {
  userId: string;
  fullName: string;
  phone: string | null;
  active: boolean;
  balance: number;
  ledgerBalance: number;
  reconciled: boolean;
  updatedAt: string;
};

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";
export type TicketCategory = "loans" | "repayments" | "kyc" | "savings" | "account" | "payments" | "other";

export type AdminTicket = {
  id: string;
  subject: string;
  category: TicketCategory | string;
  priority: TicketPriority | string;
  status: TicketStatus | string;
  customer: { id: string; fullName: string; phone: string | null; email: string | null; active: boolean } | null;
  assignee: { id: string; name: string } | null;
  messageCount?: number;
  createdById: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTicketMessage = {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: "staff" | "customer" | "system" | string;
  body: string;
  createdAt: string;
};

export type AdminTicketDetail = {
  ticket: AdminTicket;
  messages: AdminTicketMessage[];
  history: Array<{ id: string; action: string; actorId: string | null; metadata: Record<string, unknown>; createdAt: string }>;
};

export type AdminStaff = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  isSelf: boolean;
  lastLoginAt?: string | null;
};

export type AdminStats = {
  customers: number;
  pendingApplications: number;
  offeredLoans: number;
  activeLoans: number;
  overdueLoans: number;
  outstandingPortfolio: number;
  savingsTotal: number;
  savingsAccounts: number;
  pendingKyc: number;
  transactionsAttention: { pending: number; failedLast7d: number };
  openTickets: number;
  recentApplications: AdminLoan[];
  generatedAt: string;
};

export type ReportPreset = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

export type AdminReport = {
  generatedAt: string;
  period: { preset: ReportPreset; from: string | null; to: string | null; label: string };
  customers: { total: number; verified: number; newInPeriod: number; deactivated: number };
  loans: {
    applications: number;
    pending: number; offered: number; disbursing: number; active: number; paid: number; overdue: number; rejected: number; failed: number;
    approvedPrincipal: number;
    outstanding: number;
  };
  revenue: {
    totalDisbursed: number;
    totalCollected: number;
    realizedInterest: number;
    expectedInterest: number;
    disbursementsPending: number;
    disbursementsFailed: number;
    collectionsPending: number;
    collectionsFailed: number;
  };
  savings: { total: number; accounts: number; deposits: number; withdrawals: number };
  ratios: { defaultRatePct: number; repaymentRatePct: number; parPct: number; approvalRatePct: number };
  monthly: Array<{ month: string; disbursed: number; collected: number; applications: number; newCustomers: number }>;
  daily: Array<{ day: string; applications: number; approved: number; disbursed: number; collected: number }>;
  today: { applications: number; approved: number; rejected: number; disbursed: number; collected: number };
};

export type AdminConfig = {
  environment: string;
  pricing: {
    maxAprPercent: number; minTermDays: number; savingsAprPercent: number; savingsDiscountPercent: number;
    savingsThreshold: number; compound: boolean; dataRetentionYears: number;
  };
  providers: {
    payments: {
      name: string; configured: boolean; webhookMode: string; verifyCallbacks: boolean; callbackBaseUrl: string | null;
      lastWebhookAt: string | null; lastWebhookStatus: string | null;
    };
    sms: { provider: string | null; configured: boolean; senderId: string | null };
    kyc: { name: string; configured: boolean; environment: string };
  };
  auth: { accessTokenTtl: string; refreshTokenTtlDays: number; otpTtlSeconds: number; otpMaxAttempts: number };
  database: { lastMigration: string | null; lastMigrationAt: string | null };
};
