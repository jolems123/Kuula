export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "success" | "warning" | "info" | "alert";
  isRead: boolean;
  createdAt: string;
};

export type CustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  verified: boolean;
  kyc_verified: boolean;
  loans_total: number;
  created_at: string;
};

export type AdminStats = {
  totalCustomers: number;
  pendingApprovals: number;
  overdueLoans: number;
  recentApplications: Array<{
    id: string;
    applicantId: string;
    applicantName: string;
    amount: number;
    purpose: string;
    termDays: number;
    channel: string;
    status: "pending" | "resubmitted" | "offered" | "disbursing" | "approved" | "rejected" | "active" | "paid" | "overdue" | "failed";
    total: number;
    createdAt: string;
    decidedAt: string | null;
    decisionNotes: string | null;
    offerExpiresAt?: string | null;
  }>;
  monthlyChart: Array<{ month: string; loans: number; amount: number }>;
};

export type InvestorReport = {
  generatedAt: string;
  customers: {
    total: number;
    verified: number;
    newThisMonth: number;
  };
  loans: {
    total: number;
    pending: number;
    offered: number;
    disbursing: number;
    active: number;
    paid: number;
    overdue: number;
    rejected: number;
    disbursedPrincipal: number;
    outstanding: number;
  };
  revenue: {
    totalDisbursed: number;
    totalCollected: number;
    realizedInterest: number;
    expectedInterest: number;
  };
  ratios: {
    defaultRatePct: number;
    repaymentRatePct: number;
    parPct: number;
  };
  monthly: Array<{
    month: string;
    disbursed: number;
    collected: number;
    newCustomers: number;
  }>;
  today: {
    applications: number;
    approved: number;
    rejected: number;
    disbursed: number;
    collected: number;
  };
  daily: Array<{
    day: string;
    applications: number;
    approved: number;
    disbursed: number;
    collected: number;
  }>;
};

export function clearServiceCache(): void {
  // Node backend mode: no Supabase client cache to clear.
}
