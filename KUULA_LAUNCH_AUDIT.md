# KUULA LAUNCH AUDIT.md

> **Kuula** — Existing standalone lending application  
> **Audit Date**: 29 July 2026  
> **Audit Type**: Pre-launch independent investigation (Explore Mode)  
> **Mode Constraint**: No code, schema, or configuration was modified during this audit

---

## 1. EXECUTIVE SUMMARY

Kuula is a fintech lending application targeting the Ugandan market. It is built as a **React/TypeScript mobile-first web app** (wrapped in Capacitor for Android/iOS) with a **Node.js/Express backend** (Prisma ORM, PostgreSQL) and a **separate Supabase Edge Function** layer that is currently **disabled** at the application level.

### Key Finding: THE APP DOES NOT MOVE REAL MONEY

This is the single most important finding of this audit:

- **Disbursements** are simulated by crediting an in-app "wallet" balance (a database column). No real mobile-money payout is sent.
- **Repayments** are simulated by deducting from the same in-app wallet. No mobile-money collection is triggered.
- **Supabase Edge Functions** (`marzpay-disburse`, `marzpay-collect`, `marzpay-webhook`) exist and implement real MarzPay integration, but the frontend has `isSupabaseConfigured = false` — the app never calls these functions.
- **The Node backend wallet is not a real wallet** — it is a ledger entry with no backing financial infrastructure.

**Overall Verdict: NOT READY FOR PRODUCTION**

The application has a well-structured architecture, clean code, good compliance settings (APR caps, term minimums), and working user flows for registration, KYC, and navigation. However, the financial core — the entire loan lifecycle from disbursement to repayment — operates on simulated money. Additional critical issues include a dual-backend architecture (Node + disabled Supabase), plaintext localStorage token storage, missing SMS/notification infrastructure, and zero integration test coverage for financial operations.

---

## 2. ARCHITECTURE

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Mobile Framework** | React 18 + TypeScript + Vite (PWA) + Capacitor 7 |
| **Frontend State** | React Context + useReducer |
| **Routing** | React Router v7 (HashRouter) |
| **Styling** | Tailwind CSS 4 + inline styles |
| **i18n** | i18next (en, sw, lg) |
| **Backend (active)** | Node.js / Express 5 + Prisma ORM |
| **Backend (disabled)** | Supabase Edge Functions (Deno runtime) |
| **Database** | PostgreSQL (Prisma-managed + Supabase-managed — two parallel schemas) |
| **Auth (active)** | Custom JWT (24h expiry) + bcrypt + phone OTP |
| **Auth (disabled)** | Supabase Auth |
| **Payment Provider** | MarzPay (via Supabase Edge Functions — **disabled**) |
| **KYC Provider** | Smile ID Enhanced KYC (optional, fail-safe) |
| **File Storage** | Local filesystem (`uploads/kyc/`) |
| **Real-time** | Polling (10s interval for messages, 30s for notifications) |
| **Charts** | Recharts |
| **PDF Export** | jsPDF + jspdf-autotable |
| **Excel Export** | xlsx (SheetJS) |

### Architectural Pattern

**Layered architecture** with a clear separation:
1. **Mobile/Web Frontend** — React SPA with lazy-loaded screens, bottom navigation for customers, sidebar navigation for admin
2. **Node API Server** — Express.js REST API with middleware stack (helmet, cors, rate-limit, auth, error handler)
3. **PostgreSQL Database** — Prisma ORM for schema and queries
4. **Supabase Edge Functions** (disabled) — Deno-based serverless for real MarzPay money operations + credit scoring

### DUAL BACKEND PROBLEM

The codebase contains **two complete backend implementations**:
- `server/` — Node.js/Express + Prisma (used by the frontend)
- `supabase/functions/` — Deno Edge Functions (disabled at app level)

Both have:
- Separate database schemas (Prisma schema vs SQL migrations)
- Separate credit scoring engines (duplicated code)
- Conflicting wallets (`Wallet` in Prisma vs `wallets` in Supabase)
- Conflicting auth systems (JWT in Node vs Supabase Auth)

The frontend's `src/app/lib/supabase.ts` explicitly returns `isSupabaseConfigured = false` and `supabase = null`, yet the frontend code calls `supabase.auth.signOut()` in the logout handler (which is a null-safe no-op).

### Entry Point

```
index.html → src/main.tsx → ErrorBoundary → AppProvider → App (HashRouter)
```

App.tsx mounts a `Shell` component that:
1. Bootstraps session from localStorage token
2. Configures native chrome (status bar, splash hide)
3. Sets up real-time polling subscriptions
4. Renders routes (Guard wrappers for auth/admin)

### Execution Start (Server)

```
server/src/index.ts
  → Validate required env vars (DATABASE_URL, JWT_SECRET)
  → Configure express (helmet, cors, rate-limit, body parsers)
  → Mount routes: /api/auth, /api/loans, /api/savings, /api/admin, /api/kyc, etc.
  → Start listening on PORT (default 3000)
  → Graceful shutdown on SIGTERM/SIGINT
```

---

## 3. DIRECTORY STRUCTURE

```
Kuula/
├── server/                         # Node.js backend (ACTIVE)
│   ├── prisma/
│   │   ├── schema.prisma           # Data model — 8 tables
│   │   └── migrations/             # 3 Prisma migrations
│   └── src/
│       ├── index.ts                # Express app bootstrap
│       ├── seed.ts                 # Test/admin seed data
│       ├── middleware/
│       │   ├── auth.ts             # JWT gen/verify, role guards
│       │   └── error-handler.ts    # AppError class + Prisma error handler
│       ├── lib/
│       │   ├── prisma.ts           # PrismaClient singleton
│       │   ├── compliance.ts       # Compliance constants (APR caps, terms)
│       │   ├── credit-score.ts     # Credit scoring engine
│       │   ├── pricing.ts          # Loan pricing (APR calc, monthly payment)
│       │   ├── nin.ts              # Uganda NIN validation
│       │   ├── smile-id.ts         # Smile ID KYC integration
│       │   └── storage.ts          # KYC document file persistence
│       └── routes/
│           ├── auth.ts             # Signup, login, verify-phone, me, etc.
│           ├── loans.ts            # Application, quote, repayment, top-up
│           ├── admin.ts            # Dashboard stats, approval, reject, report
│           ├── kyc.ts              # KYC submission and status
│           ├── savings.ts          # Deposit, withdraw
│           ├── transactions.ts     # Transaction history
│           ├── goals.ts            # Savings goals CRUD
│           ├── notifications.ts    # Notifications list, mark read
│           └── messages.ts         # Support chat messaging
│
├── src/                            # Frontend (React + Vite)
│   ├── main.tsx                    # React root mount with error boundary
│   ├── app/
│   │   ├── App.tsx                 # HashRouter, route guard, shell layout
│   │   ├── api/
│   │   │   ├── client.ts           # Node API client (all HTTP calls)
│   │   │   ├── types.ts            # SessionPayload, LoanApplication, etc.
│   │   │   └── types-compat.ts     # AdminStats, InvestorReport types
│   │   ├── components/
│   │   │   ├── BottomNav.tsx        # 5-tab customer nav bar
│   │   │   ├── AdminLayout.tsx      # Admin sidebar + topbar + shared components
│   │   │   └── screens/            # ~130 screen components (lazy loaded)
│   │   ├── context/
│   │   │   └── AppContext.tsx       # Global state (session, user, credit, loan, messages)
│   │   ├── config/
│   │   │   └── env.ts              # VITE_* env vars, startup validation
│   │   ├── data/
│   │   │   └── mockData.json       # Demo/test data for offline mode
│   │   ├── lib/
│   │   │   ├── supabase.ts         # Supabase shim (always disabled)
│   │   │   ├── useRealtimeSubscriptions.ts  # Polling for messages/notifications
│   │   │   ├── pricing.ts          # Client-side pricing (mirrors server)
│   │   │   ├── nin.ts              # NIN validation (mirrors server)
│   │   │   ├── rate-limiter.ts     # Client-side rate limiter
│   │   │   ├── selection.ts        # Cross-screen ephemeral state
│   │   │   ├── export.ts           # PDF/Excel/CSV export utilities
│   │   │   ├── investorReport.ts   # Admin report export
│   │   │   └── receipt.ts          # Payment receipt PDF
│   │   └── screens/
│   │       └── registry.ts         # Screen registry (130+ routes mapped to components)
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/ (en.json, sw.json, lg.json)
│   ├── styles/
│   │   ├── tailwind.css
│   │   ├── globals.css
│   │   └── theme.css
│   └── lib/
│       └── native-chrome.ts        # Capacitor native bridge (status bar, splash, back)
│
├── supabase/                       # Supabase (DISABLED)
│   ├── config.toml                 # Functions config, cron schedules
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── core.ts             # Shared pricing + credit scoring
│   │   │   └── marzpay.ts          # MarzPay API client
│   │   ├── credit-score/           # Edge Function: compute credit score
│   │   ├── auto-collect/           # Scheduled: auto repayment collection
│   │   ├── marzpay-disburse/       # Real loan disbursement via MarzPay
│   │   ├── marzpay-collect/        # Real repayment collection via MarzPay
│   │   └── marzpay-webhook/        # MarzPay async callback handler
│   └── migrations/                 # 7 SQL migrations (0001–0007)
│       ├── 0001_init.sql           # Core schema + RLS + triggers
│       ├── 0002_transactions_and_loan_fields.sql
│       ├── 0003_goals_and_notifications.sql
│       ├── 0004_repayment_rpc.sql  # Authoritative money movement
│       ├── 0005_loan_offer_acceptance.sql
│       ├── 0006_security_hardening.sql  # Fixes privilege escalation, ledger forgery
│       └── 0007_data_retention.sql      # GDPR, pg_cron, deletion
│
├── android/                        # Capacitor Android project
├── ios/                            # Capacitor iOS project
├── public/                         # Static assets (icons, manifest)
└── assets/                         # Source brand assets
```

---

## 4. USER ROLES

### Roles Found in Code

| Role | Source | Used In |
|------|--------|---------|
| `user` | Prisma default, `normalizeRole()` | All customer endpoints |
| `admin` | Prisma, `normalizeRole()` | Admin routes, approval, reports |
| `manager` | `normalizeRole()` / `requireRoles()` | Referenced but **never assigned** |
| `officer` | `normalizeRole()` / `requireRoles()` | Referenced but **never assigned** |
| `customer` | `normalizeRole()` | Referenced but **never assigned** |

**Only `user` and `admin` roles are actually used.** The `manager`, `officer`, and `customer` roles exist in the `requireRoles` middleware references but no user is ever assigned them and no route logic differentiates them.

### Authentication Flows per Role

| Capability | `user` | `admin` |
|------------|--------|---------|
| Registration | Phone + password + NIN + email + consent | ❌ No self-registration |
| Login | Phone + password ("pin") | Email + password |
| OTP Verification | Phone OTP (6-digit) | Separate OTP screen exists but never called |
| Session Token | JWT in localStorage | JWT in localStorage |
| Token Expiry | 24 hours | 24 hours |
| Password Reset | Email-based OTP | Same endpoint |
| Forgot PIN | No dedicated flow | N/A |
| Biometric | `ENABLE_BIOMETRIC` flag exists, not implemented | N/A |
| Account Deletion | Soft-delete (set `deletedAt`) | ❌ Cannot delete own account |
| Logout | Clear localStorage token + Supabase signOut | Clear localStorage |

---

## 5. ACCESS MATRIX

| Resource | Endpoint / Route | `user` | `admin` | Notes |
|----------|-----------------|--------|---------|-------|
| **Auth** | | | | |
| `/api/auth/signup` | POST | ✅ | ❌ | New user registration |
| `/api/auth/login` | POST | ✅ | ✅ | Both roles can log in with phone |
| `/api/auth/admin-login` | POST | ❌ | ✅ | Admin email+password login |
| `/api/auth/me` | GET | ✅ | ✅ | Session restoration |
| `/api/auth/verify-phone` | POST | ✅ | ❌ | OTP verification |
| `/api/auth/signout` | POST | ✅ | ✅ | Returns `{ok: true}` no-op |
| **Loans** | | | | |
| `/api/loans/applications` | GET | Own only | All | Admin sees all |
| `/api/loans/applications` | POST | ✅ | ❌ | Create application |
| `/api/loans/applications/decision` | POST | ❌ | ✅ | Admin only (status → "offered"/"rejected") |
| `/api/loans/:id/accept` | POST | Own only | ❌ | Accept loan offer |
| `/api/loans/quote` | POST | ✅ | ✅ | Pricing quote |
| `/api/loans/repayment` | GET | ✅ | ✅ | Next repayment info |
| `/api/loans/repayment/pay` | POST | ✅ | ❌ | Wallet-based repayment |
| `/api/loans/top-up` | POST | ✅ | ❌ | Additional loan request |
| **Admin** | | | | |
| `/api/admin/stats` | GET | ❌ | ✅ | Dashboard statistics |
| `/api/admin/customers` | GET | ❌ | ✅ | Customer list |
| `/api/admin/savings-overview` | GET | ❌ | ✅ | Savings data |
| `/api/admin/investor-report` | GET | ❌ | ✅ | Financial report |
| `/api/admin/loans/:id/approve` | POST | ❌ | ✅ | Approve loan (real money effect) |
| `/api/admin/loans/:id/reject` | POST | ❌ | ✅ | Reject loan |
| `/api/admin/loans/:id/resubmit` | POST | ❌ | ✅ | Return for review |
| **KYC** | | | | |
| `/api/kyc/status` | GET | ✅ | ❌ | Own KYC status |
| `/api/kyc/submit` | POST | ✅ | ❌ | Submit KYC with ID images |
| **Savings** | | | | |
| `/api/savings` | GET | ✅ | ❌ | Own savings balance |
| `/api/savings/deposit` | POST | ✅ | ❌ | Deposit to savings |
| `/api/savings/withdraw` | POST | ✅ | ❌ | Withdraw from savings |
| **Wallet** | | | | |
| `/api/wallet/topup` | POST | ✅ | ❌ | **Always returns 400 — disabled** |
| **Messages** | | | | |
| `/api/messages` | GET | Own threads | All | Admin sees all |
| `/api/messages` | POST | ✅ (to admin only) | ✅ (to anyone) | Customer → Admin only |
| **Transactions** | | | | |
| `/api/transactions` | GET | Own only | All | Transaction history |
| **Credit** | | | | |
| `/api/credit/score` | GET | ✅ | ✅ | Computed score |
| **Notifications** | | | | |
| `/api/notifications` | GET | ✅ | ❌ | Own notifications |
| `/api/notifications/:id/read` | POST | ✅ | ❌ | Mark one read |
| `/api/notifications/read-all` | POST | ✅ | ❌ | Mark all read |

### PASS/FAIL Assessment

| Criterion | Status | Issue |
|-----------|--------|-------|
| Borrower can't access other borrower data | ✅ PASS | Filtered by `applicantId: req.user!.userId` |
| Admin can access all | ✅ PASS | Admin queries check `req.user!.role === "admin"` |
| Customer can't access admin functions | ✅ PASS | `requireRoles` middleware checks |
| Customer can't message other customers | ✅ PASS | Messages restricted to admin recipients |
| IDOR prevention in loan acceptance | ✅ PASS | Checks `existing.applicantId !== userId` |
| IDOR prevention in goals | ✅ PASS | Filtered by userId |
| IDOR prevention in KYC | ✅ PASS | Always scoped to JWT userId |
| **Critical: Role escalation at signup** | ❌ **FAIL (FIXED in Supabase, BROKEN in Node)** | Node backend `role: "user"` is hardcoded — safe. But Supabase migration 0006 explicitly documents that the original `handle_new_user()` copied `role` from client-controlled metadata, allowing anyone to register as admin. This was fixed in migration 0006 but the Node backend was never vulnerable. |

---

## 6. SCREEN INVENTORY

### Screen Count

| Category | Count |
|----------|-------|
| **Total registered screens** | 130+ |
| **Public (onboarding, welcome, auth, KYC)** | ~10 |
| **Customer (borrower dashboard, loans, savings, support)** | ~60 |
| **Admin (dashboard, loan management, customers, reports, settings)** | ~60+ |

### Critical Screen Findings

| Screen | Route | Status | Issue |
|--------|-------|--------|-------|
| Onboarding | `/onboarding` | ✅ WORKS | Carousel for first launch |
| Welcome | `/welcome` | ✅ WORKS | Login / Sign-up entry |
| Create Account | `/create-account` | ✅ WORKS | Full form with validation |
| Phone Verify | `/phone-verify` | ✅ WORKS | OTP entry (console-logged) |
| KYC | `/kyc` | ✅ WORKS | 3-step NIN + ID upload |
| Home | `/home` | ✅ WORKS | Dashboard with credit, loan, savings |
| Dashboard | `/dashboard` | ✅ WORKS | 3-tab (overview, loan calc, credit) |
| Loan Apply | `/loan-apply` | ✅ WORKS | Amount slider, term, purpose, pricing |
| Loan Review | `/loan-review` | ✅ WORKS | Confirmation step |
| Loan Approval | `/loan-approval` | ✅ WORKS | Status display |
| Loan Detail | `/loan-detail` | ✅ WORKS | Active loan detail |
| Loan History | `/loan-history` | ✅ WORKS | Past loans list |
| Make Payment | `/make-payment` | ✅ WORKS | Wallet-based repayment |
| Payment Confirm | `/payment-confirm` | ✅ WORKS | Success screen |
| Goals | `/goals` | ✅ WORKS | Savings goals list |
| Create Goal | `/create-goal` | ✅ WORKS | New savings goal |
| Wallet | `/wallet` | ✅ WORKS | Wallet overview |
| Transaction History | `/transaction-history` | ✅ WORKS | Transaction list |
| Credit Dashboard | `/credit-dashboard` | ✅ WORKS | Credit score gauge |
| Notifications | `/notifications` | ✅ WORKS | Notification list |
| Settings | `/settings` | ✅ WORKS | Settings screen |
| Profile | `/profile` | ✅ WORKS | User profile |
| Admin Dashboard | `/admin-dashboard` | ✅ WORKS | Stats, charts, recent apps |
| Admin Loan Apps | `/admin-loan-apps` | ✅ WORKS | Application list |
| Admin Loan App Detail | `/admin-loan-app-detail` | ✅ WORKS | Single app detail |
| Admin Loan Approval | `/admin-loan-approval` | ⚠️ PARTIAL | Approval screen exists; backend path is different |
| Admin Customer List | `/admin-customer-list` | ✅ WORKS | Customer list |
| Admin Customer Detail | `/admin-customer-detail` | ✅ WORKS | Customer detail |
| Admin Reports | `/admin-reports` | ✅ WORKS | Report dashboard |
| **Extra screens** | Many | ⚠️ NOT VERIFIED | ~90 additional admin screens exist in registry but were not deep-inspected |

### No Dead or Empty Screens Found

All screens in the registry have valid lazy-load imports to actual component files. No component was found to be a stub or placeholder rendering null/empty content.

---

## 7. INTERACTION AUDIT

### Key Buttons / Actions Audit

| Action | Location | Classification | Notes |
|--------|----------|---------------|-------|
| **Apply Now** | LoanApplyScreen | ✅ WORKS | Navigates to loan-review after 2s loading |
| **Submit KYC** | KycScreen | ✅ WORKS | Calls API, shows success/error |
| **Pay Now** | MakePaymentScreen | ⚠️ PARTIAL | In real mode, calls `/api/loans/repayment/pay` which deducts from wallet balance — no real MoMo collection |
| **Get [amount] (Top-up)** | DashboardScreen | ⚠️ PARTIAL | Calls `/api/loans/top-up` which creates a new application |
| **Generate Report** | AdminDashboardScreen | ✅ WORKS | Calls `getInvestorReport()` + PDF download |
| **Approve / Reject** | AdminLoanScreens | ⚠️ PARTIAL | Backend routes exist but frontend paths need verification |
| **Logout** | Various | ✅ WORKS | Clears localStorage, dispatches LOGOUT |
| **Delete Account** | DeleteAccountScreen | ✅ WORKS | Soft-delete via `/api/users/me/delete` |
| **Savings Deposit** | AddMoneyScreen | ✅ WORKS | Calls `/api/savings/deposit` |
| **Savings Withdraw** | WithdrawSavingsScreen | ✅ WORKS | Calls `/api/savings/withdraw` |
| **Mark Notifications Read** | NotificationsListScreen | ✅ WORKS | Calls `/api/notifications/:id/read` |

### No-Op or Broken Interactions Found

| Action | Issue |
|--------|-------|
| Wallet Top-up | Always returns 400 — disabled |
| Supabase Auth signOut | Called on logout but `supabase` is null |
| Biometric setup | Feature flag exists, no implementation |
| Admin OTP screen | Route exists but no backend endpoint for admin OTP |

---

## 8. REAL DATA VS MOCK DATA

### mockData.json Contents

The file `src/app/data/mockData.json` contains **demo user data** used when `VITE_USE_API=false` (the default!):

```json
{
  "user": "Amara Nakato" (fictional),
  "creditProfile": { "score": 742, "tier": "Excellent" },
  "loanProfile": { "availableCredit": 1500000, "activeLoan": { "amount": 500000 } },
  "savings": { "balance": 340000 },
  "recentTransactions": [/* 5 items */],
  "notifications": [/* 4 items */],
  "paymentMethods": [/* 2 items */]
}
```

### Data Source Classification

| Displayed Value | Offline Mode (`USE_API=false`) | Real Mode (`USE_API=true`) |
|----------------|-------------------------------|---------------------------|
| User Name | 🟡 MOCK (from mockData.json) | ✅ REAL (from DB) |
| Phone | 🟡 MOCK | ✅ REAL (from DB) |
| Available Credit | 🟡 MOCK (fictional 1,500,000) | ✅ REAL (calculated from credit score) |
| Credit Score | 🟡 MOCK (742 Excellent) | ✅ REAL (computed server-side) |
| Savings Balance | 🟡 MOCK (340,000) | ✅ REAL (from DB) |
| Active Loan Amount | 🟡 MOCK (500,000) | ✅ REAL (from DB) |
| Next Payment Amount | 🟡 MOCK (285,000) | ✅ REAL (from DB) |
| Repayment Progress % | 🟡 MOCK (42%) | ✅ REAL (calculated from DB) |
| Recent Transactions | 🟡 MOCK (5 demo items) | ✅ REAL (from DB, last 50) |
| Notifications | 🟡 MOCK (4 demo items) | ✅ REAL (from DB) |
| Loan Quote (APR, interest) | ✅ REAL (calculated) | ✅ REAL (calculated) |
| **Wallet Balance** | 🟡 NOT DISPLAYED | 🟡 SIMULATED (in-app DB column, no real money) |
| **Disbursement Status** | 🟡 MOCK | 🟡 SIMULATED (wallet credit, no real MoMo) |

### Critical Mock Data Issue

The **default configuration** (`VITE_USE_API=false` by default in `.env.example`) means the app ships with **demo/dummy financial data** shown to users by default. A production build **must** set `VITE_USE_API=true` — and the `getConfigErrors()` function correctly blocks production builds with `USE_API=false`. However, if a misconfigured build ships, users will see entirely fictional financial data showing a fictional loan, fictional savings, and fictional credit score.

---

## 9. LOAN PRODUCTS

### LOAN PRODUCT MATRIX

| Product | Details |
|---------|---------|
| **Name** | Personal Loan (no product name — single product type) |
| **Borrower Type** | Individual (user role) |
| **Eligibility** | Credit score based: ≥750 → 2M UGX, ≥700 → 1M UGX, ≥600 → 500K, ≥500 → 200K, <500 → 0 |
| **Loan Limit** | 50,000 – 2,000,000 UGX |
| **Term (days)** | 90–365 (min 90 enforced by code) |
| **APR** | 33.6% max (can be reduced to 31.92% with savings discount) |
| **Interest Model** | Simple interest: `principal × (APR/365) × days` |
| **Fees** | Service fee rate: 10% (stored in schema but set to 0 in frontend display) |
| **Approval Method** | Manual (admin decides) or automated (not implemented) |
| **Disbursement Method** | In-app wallet credit (simulated) |
| **Repayment Method** | In-app wallet debit (simulated) |
| **Status** | Single loan product — no product variations |

### Findings

- Only **one loan product** exists. The schema stores `serviceFeeRate` (10%) and `interestRate` (26%) as defaults but the frontend pricing engine uses APR-based calculation.
- The `AdminLoanProductsScreen` exists in the registry but the backend has **no API** for configuring loan products — it's a frontend-only screen.
- No tiered lending, no sector-based pricing, no loan purpose differentiation in pricing.

---

## 10. LOAN LIFECYCLE

### Complete Journey (Node Backend)

```
Borrower → Create Account → Phone Verify → KYC Submit → Home/Dashboard
  ↓
Loan Application (POST /api/loans/applications)
  → status: "pending"
  ↓
Admin Decision (POST /api/admin/loans/:id/approve)
  → status: "approved"
  → Wallet credited with principal (SIMULATED disbursement)
  → Repayment schedule created
  → Transaction recorded
  → Notification sent (in-app only)
  ↓
Loan is "active"
  ↓
Repayment (POST /api/loans/repayment/pay)
  → Wallet debited
  → Repayment marked "paid" when fully paid
  → LoanApplication status: "paid"
  ↓
Loan Complete
```

### Current Status Flow (Node Backend)

```
"pending" → (admin approve) → "approved" → (auto) → "active"
"pending" → (admin reject) → "rejected"
"active" → (full repayment) → "paid"
"active" → (past due detected) → "overdue"
"rejected" → (admin resubmit) → "resubmitted" → (admin approve) → "approved"
```

### Supabase Edge Function Flow (Disabled)

The Supabase flow adds an intermediate `"offered"` state:

```
"pending" → (admin approve) → "offered" → (borrower accept via marzpay-disburse) → "approved"
```

The `marzpay-disburse` function:
1. Verifies the borrower owns the offer
2. Claims the offer via `accepted_at` compare-and-set (idempotency lock)
3. Sends **real MoMo payout** via MarzPay
4. Books the loan (flips to "approved")
5. Records transaction

This is the **correct real-money flow** — but it's completely disconnected from the app.

### Invalid State Transition Detection

| Illegal Transition | Prevention |
|-------------------|------------|
| Disbursement before approval | ✅ Not possible (status check) |
| Double approval | ⚠️ Partial — checks `status: "pending"` before update |
| Disbursement twice | ⚠️ **VULNERABLE**: No idempotency check on Node backend approve route |
| Repayment before disbursement | ✅ Not possible (no balance to pay) |
| Completed loan becomes active | ✅ Status not reversible |
| Rejected loan disbursed | ✅ Status check prevents |
| Financial terms changed after disbursement | ⚠️ No audit trail for term changes |

---

## 11. CREDIT SCORING

### Implementation

**File**: `server/src/lib/credit-score.ts`

**Inputs and Weights**:

| Factor | Weight | Input | Max Score Contribution |
|--------|--------|-------|----------------------|
| Mobile Money History | 25% | MoMo months (normalized to 12) + MoMo txn count (normalized to 100) | 137.5 points |
| Credit Reference Bureau | 15% | "clean"=1, "thin"=0.6, "adverse"=0.25 | 82.5 points |
| Savings Behavior | 15% | Balance normalized to 500,000 UGX | 82.5 points |
| KYC Verification | 15% | Verified=1, Unverified=0 | 82.5 points |
| Repayment History | 30% | Repaid/Total ratio (or 0.5 if no loans) | 165 points |

**Formula**: `score = 300 + 550 × Σ(factor.value × factor.weight)`

**Score Range**: 300–850

**Tiers**: Poor (<580), Fair (580-669), Good (670-739), Very Good (740-799), Excellent (≥800)

### Scoring Logic Assessment

- **Formula is reasonable** but uses **hardcoded thresholds** (12 months, 100 transactions, 500,000 UGX savings)
- **No time-based decay** — older defaults never reduce score over time
- **CRB status is hardcoded** — no actual CRB API integration
- **Repayment history weight (30%)** is appropriate but only tracks loan-count ratio (repaid/total), not monetary amounts or timeliness
- **KYC weight (15%)** is reasonable
- The scoring engine is **duplicated** in 3 places:
  1. `server/src/lib/credit-score.ts`
  2. `supabase/functions/_shared/core.ts`
  3. Client not present (relies on server)

### Verdict: Functionally adequate but arbitrary

The inputs (momoMonths, momoTxnCount, crbStatus) are all **self-reported or manually set** — there is no integration with MoMo APIs or CRB Uganda to verify these values. Currently they are populated from seed data or set by admin. The score is reproducible given the same inputs, but the inputs themselves may not accurately reflect the borrower's true creditworthiness.

---

## 12. CREDIT LIMITS & EXPOSURE

### Credit Limit Calculation

In `auth.ts` `buildSession()`:
```
scoreValue >= 750  → 2,000,000 UGX
scoreValue >= 700  → 1,000,000 UGX
scoreValue >= 600  → 500,000 UGX
scoreValue >= 500  → 200,000 UGX
scoreValue < 500   → 0 UGX
```

**`availableCredit` is set to 0 if the user already has an active loan**: `availableCredit: activeApp ? 0 : tierLimit`

### Exposure Checks

| Scenario | Protected? | Details |
|----------|-----------|---------|
| Multiple concurrent applications | ⚠️ PARTIAL | No unique constraint on applicant_id+status. User could submit multiple "pending" apps. |
| Multiple active loans | ⚠️ **NOT PROTECTED** | The `buildSession` limits `availableCredit` to 0 when an active loan exists, but the loan application endpoint does NOT check for existing active loans before creating a new one. |
| Duplicate approval | ⚠️ PARTIAL | Admin approve route checks `status: "pending"`. But two concurrent admin approval requests could both pass. |
| Credit limit restoration after repayment | ✅ PASS | `availableCredit` recalculates when user has no active loan |
| Over-borrowing | ⚠️ PARTIAL | Amount cap is 2M UGX (max slider). No check against existing exposure. |

### RECOMMENDATION: Add constraint or check to prevent multiple active loans

---

## 13. UNDERWRITING & APPROVAL

### Current Flow (Node Backend)

| Step | Handler | Authorization |
|------|---------|---------------|
| Admin approves | `POST /api/admin/loans/:id/approve` | `authenticateToken` + `requireRoles("admin", "manager", "officer")` |
| Admin rejects | `POST /api/admin/loans/:id/reject` | Same |
| Admin resubmits rejected | `POST /api/admin/loans/:id/resubmit` | Same |

### Key Issues

- **No scoring-based auto-approval** — all decisions are manual
- **No approval limits/levels** — any admin can approve any amount
- **Decision notes required for rejection** ✅ but not for approval
- **Audit trail** — `decidedAt` timestamp set, `approvedBy` field exists but never populated (no user info stored in decision)
- **`approvedBy`** column is never written to (always null)
- **No risk check** before approval — admin dashboard shows no credit score or risk data before approving

---

## 14. DISBURSEMENT

### Node Backend Path (SIMULATED)

`POST /api/admin/loans/:id/approve`:
1. Validate application exists and status is "pending"/"resubmitted"
2. Update status to "approved", set `decidedAt`, `decisionNotes`
3. Create `Repayment` record (full term, full due amount)
4. Create `Transaction` record (type: `loan_disbursement`, status: `completed`)
5. **Credit wallet balance** (upsert, increment by principal)
6. Create `Notification`
7. Return success

### Critical Disbursement Issues

1. **NO REAL MONEY SENT** — No MoMo payout, no bank transfer, no payment provider called
2. **NO BENEFICIARY VERIFICATION** — No check that the borrower's phone number is valid for MoMo
3. **NO IDEMPOTENCY** — The route does not check if a loan has already been disbursed. Two simultaneous admin requests could double-disburse
4. **WALLET CREDIT IS NOT BACKED** — The wallet balance is just a database number. It's not real money and cannot be withdrawn
5. **The Supabase `marzpay-disburse` path is correct but never used**

### Supabase Disbursement Path (REAL, DISABLED)

`marzpay-disburse` Edge Function:
1. Validates JWT
2. Verifies loan applicant matches caller
3. Claims offer with compare-and-set on `accepted_at` (idempotent)
4. Sends MarzPay payout
5. Only books loan after successful MarzPay acceptance
6. Retries DB update on transient failure
7. Records pending transaction for webhook settlement

This is the correct implementation — but it requires Supabase to be enabled.

---

## 15. REPAYMENT

### Node Backend Path (SIMULATED)

`POST /api/loans/repayment/pay`:
1. Find active unpaid repayment for user
2. Check wallet balance
3. Deduct from wallet
4. Update repayment `amountPaid` and status
5. If fully paid, update `LoanApplication` status to "paid"
6. Create `Transaction` (type: `loan_payment`, status: `completed`)

### Critical Repayment Issues

1. **NO REAL MONEY COLLECTED** — Wallet deduction is simulated
2. **NO PAYMENT PROVIDER INTEGRATION** — The MakePaymentScreen in the frontend sends a request that deducts from an in-app balance. No MoMo request-to-pay is sent
3. **AMOUNT NOT ALLOCATED** — The repayment system tracks total amount only. No breakdown into principal, interest, fees, penalties
4. **PARTIAL PAYMENT SUPPORTED** — But allocation is unclear (just reduces total outstanding)
5. **CONCURRENT REPAYMENT RACE** — No row-level locking on wallet balance read
6. **NO RECEIPT PDF GENERATION** — The `receipt.ts` module exists but is not called from the repayment flow

### Supabase Repayment Path (REAL, DISABLED)

`marzpay-collect` Edge Function:
1. Sends MarzPay request-to-pay to borrower's phone
2. Records pending attempt
3. Creates pending transaction record
4. `marzpay-webhook` settles on callback

---

## 16. PAYMENT PROVIDER SECURITY

### Current State

No external payment provider is integrated in the active (Node) backend. The app operates with an in-app wallet that has no real-world value. Therefore:

- No callbacks/webhooks to authenticate
- No payment signatures to verify
- No idempotency keys for external payments

### Supabase MarzPay Integration (Disabled)

The Supabase Edge Functions implement proper payment security:

| Security Control | Status | Notes |
|-----------------|--------|-------|
| Webhook authentication | ✅ | `MARZPAY_WEBHOOK_SECRET` checked via query param or header |
| Idempotency (disbursement) | ✅ | Compare-and-set on `accepted_at` |
| Idempotency (repayment) | ✅ | Transaction claimed with compare-and-set (`status: "pending" → "completed"`) |
| Amount verification | ⚠️ | Webhook settles based on stored transaction amount, not callback data |
| Reference matching | ✅ | References are `LOAN-{id}` and `REPAY-{id}` |
| Replay protection | ⚠️ | Webhook uses compare-and-set, so duplicate callbacks are safe |
| Concurrency | ✅ | Lock via compare-and-set |
| Retries | ✅ | Disbursement retries DB update |

---

## 17. FINANCIAL LEDGER / ACCOUNTING

### Authoritative Source of Truth

**PostgreSQL database** via Prisma ORM. Transactions table records all financial movements.

### Balance Types

| Table | Field | Type | Used For |
|-------|-------|------|----------|
| `wallets` | `balance` | BigInt (integer) | Loan disbursements and repayments (SIMULATED) |
| `savings_accounts` | `balance` | BigInt (integer) | User savings |
| `repayments` | `total`, `amount_paid` | BigInt (integer) | Loan repayment tracking |
| `loan_applications` | `amount`, `interest`, `total`, `service_fee` | BigInt (integer) | Loan terms |
| `transactions` | `amount` | BigInt (integer) | All financial events |

### Findings

- **All amounts are BigInt** (integers in smallest currency unit — UGX, no decimals) ✅
- **No floating-point money** ✅
- **Transactions table records every event** ✅
- **No double-entry accounting** ⚠️ — Single-entry ledger, no debit/credit pairs
- **Wallet balance can go negative** ⚠️ — Prisma schema has no `check (balance >= 0)` constraint (Supabase schema does)
- **Repayment allocation is unallocated** — Total amount only, no breakdown into principal/interest/fees
- **No accrual** — Interest is calculated upfront at loan creation, not accrued daily
- **Reversals** — No mechanism for transaction reversal or refund
- **Reconciliation** — No reconciliation process for failed/partial payments
- **Rounding** — All values are `Math.round()`, consistent ✅

---

## 18. DATABASE & ORM

### Prisma Schema vs Supabase Migrations

The codebase has **two database schemas** that are mostly parallel but have diverged:

| Feature | Prisma (server/) | Supabase SQL (supabase/migrations/) |
|---------|-----------------|-------------------------------------|
| Wallet `balance >= 0` check | ❌ Missing | ✅ Present |
| Loan `amount > 0` check | ❌ Missing | ✅ Present |
| `deleted_at` on profiles | ❌ Missing | ✅ Present (migration 0006) |
| `accepted_at` on loan_applications | ❌ Missing | ✅ Present (migration 0005) |
| Loan status values | "pending","offered","approved","rejected","active","paid","overdue","failed" | Same + "resubmitted" (6 states) |
| `offered` status | ✅ Present | ✅ Present |
| RLS policies | ❌ N/A (server-side auth) | ✅ Present |
| GDPR deletion function | ❌ Missing | ✅ Present (migration 0007) |
| `pg_cron` cleanup jobs | ❌ Missing | ✅ Present (migration 0007) |
| `handle_loan_decision` trigger | ❌ Missing | ✅ Present (wallet credit removed in 0006) |
| `handle_new_user` trigger | ❌ Missing | ✅ Present (role fixed in 0006) |
| `pay_repayment` RPC | ❌ Missing | ✅ Present |
| `topup_wallet` RPC | ❌ Missing | ✅ Present |
| `adjust_savings` RPC | ❌ Missing | ✅ Present |

### Schema Drift Between Prisma and Supabase

The Prisma schema and Supabase migrations have significantly diverged. The Supabase migrations (0004-0007) contain security hardening, RLS policies, RPC functions, GDPR deletion, and audit fixes that are **not in the Prisma schema at all**.

If the database is managed by Prisma (which appears to be the case since the server uses Prisma), the security hardening from Supabase migrations 0004, 0006, and 0007 is **completely missing** from the production database.

### Index Coverage

| Table | Key Indexes | Missing |
|-------|------------|---------|
| `users` | `phone` (unique), `email` (unique) | — |
| `loan_applications` | `applicantId + createdAt`, `status` | — |
| `repayments` | `userId`, `status` | `loanId` |
| `transactions` | `userId + createdAt`, `loanId`, `status` | — |
| `notifications` | `userId + createdAt`, `userId + isRead` | — |
| `messages` | `senderId + receiverId + createdAt` | — |
| `savings_goals` | `userId + createdAt` | — |

### Other Database Findings

- **No ORM-level unique constraints** preventing duplicate active loans per user
- **No CHECK constraints** in Prisma schema for status values (enforced only at application level)
- **No cascade delete** from loan_applications to repayments (repayments have a string `loanId`, not a FK)
- **`repayments.loanId` is a string** — not a foreign key to any table, so referential integrity is lost
- **`wallet` balance can go negative** in Node backend (no DB constraint)
- **All amounts use BigInt** — correct ✅

---

## 19. API MATRIX

### Complete Endpoint Inventory

| Method | Route | Auth | Role | Input Validation | Response Shape | Status |
|--------|-------|------|------|-----------------|----------------|--------|
| GET | `/api/health` | No | — | — | `{ok, timestamp, version}` | ✅ |
| GET | `/api/compliance` | No | — | — | Compliance constants | ✅ |
| POST | `/api/auth/signup` | No | — | Name, phone, password required. NIN validated. | `{ok, needsConfirmation}` | ✅ |
| POST | `/api/auth/login` | No | — | Phone, pin required | SessionPayload | ✅ |
| POST | `/api/auth/admin-login` | No | — | Email, password required | SessionPayload | ✅ |
| POST | `/api/auth/verify-phone` | No | — | Phone, code (6-digit regex) | SessionPayload | ✅ |
| POST | `/api/auth/resend-otp` | No | — | Phone | `{ok}` | ✅ |
| POST | `/api/auth/reset-password` | No | — | Email | `{ok}` | ✅ |
| GET | `/api/auth/me` | JWT | any | — | SessionPayload | ✅ |
| POST | `/api/auth/signout` | No | — | — | `{ok}` | ✅ |
| POST | `/api/kyc/submit` | JWT | user | NIN, name, DOB, 2 images (base64, ≤5MB) | `{ok, kyc}` | ✅ |
| GET | `/api/kyc/status` | JWT | user | — | `{kyc}` | ✅ |
| GET | `/api/loans/applications` | JWT | any | — | `{applications}` | ✅ |
| POST | `/api/loans/applications` | JWT | user | Amount, termDays required | `{application}` | ✅ |
| POST | `/api/loans/applications/decision` | JWT | admin | id, decision, notes | `{application}` | ✅ |
| POST | `/api/loans/:id/accept` | JWT | user | — | `{application, repayment}` | ✅ |
| POST | `/api/loans/quote` | JWT | any | Amount, termDays | LoanQuote | ✅ |
| GET | `/api/loans/repayment` | JWT | user | — | `{repayment}` | ✅ |
| POST | `/api/loans/repayment/pay` | JWT | user | Amount (optional) | `{repayment, attempt, isPartial}` | ✅ |
| POST | `/api/loans/top-up` | JWT | user | Amount, term_days | `{success, loan_id, status, pricing}` | ✅ |
| GET | `/api/savings` | JWT | user | — | `{balance, accruedInterest, aprPercent}` | ✅ |
| POST | `/api/savings/deposit` | JWT | user | Amount > 0 | `{balance}` | ✅ |
| POST | `/api/savings/withdraw` | JWT | user | Amount > 0, sufficient balance | `{balance}` | ✅ |
| POST | `/api/wallet/topup` | JWT | user | — | **Always 400 — disabled** | ⚠️ |
| GET | `/api/transactions` | JWT | any | — | `{transactions}` | ✅ |
| GET | `/api/messages` | JWT | any | — | `{messages}` | ✅ |
| POST | `/api/messages` | JWT | any | Content required | `{message}` | ✅ |
| GET | `/api/goals` | JWT | user | — | `{goals}` | ✅ |
| POST | `/api/goals` | JWT | user | Name, target required | `{goal}` | ✅ |
| PATCH | `/api/goals/:id` | JWT | user | — | `{goal}` | ✅ |
| DELETE | `/api/goals/:id` | JWT | user | — | `{ok}` | ✅ |
| GET | `/api/notifications` | JWT | user | — | `{notifications}` | ✅ |
| POST | `/api/notifications/:id/read` | JWT | user | — | `{ok}` | ✅ |
| POST | `/api/notifications/read-all` | JWT | user | — | `{ok}` | ✅ |
| GET | `/api/credit/score` | JWT | any | — | CreditScore | ✅ |
| POST | `/api/users/me/delete` | JWT | any | — | `{ok}` | ✅ |
| GET | `/api/admin/stats` | JWT | admin | — | AdminStats | ✅ |
| GET | `/api/admin/customers` | JWT | admin | — | `{customers}` | ✅ |
| GET | `/api/admin/savings-overview` | JWT | admin | — | `{accounts, total}` | ✅ |
| GET | `/api/admin/investor-report` | JWT | admin | — | InvestorReport | ✅ |
| GET | `/api/admin/report` | JWT | admin | — | InvestorReport | ✅ |
| POST | `/api/admin/loans/:id/approve` | JWT | admin | — | `{ok, application}` | ✅ |
| POST | `/api/admin/loans/:id/reject` | JWT | admin | decisionNotes required | `{ok, application}` | ✅ |
| POST | `/api/admin/loans/:id/resubmit` | JWT | admin | — | `{ok, application}` | ✅ |

### API Security Findings

| Issue | Severity | Details |
|-------|----------|---------|
| No request body validation schema | MEDIUM | Input validation is ad-hoc (`if (!x) throw`) — no Zod/Joi/AJV |
| Generic 500 errors leak details | MEDIUM | Error handler returns `err.message` in production responses |
| Wallet top-up hard-disabled | LOW | Returns 400 with hardcoded message |
| Admin report endpoint unauthenticated data | LOW | Requires admin JWT |
| All admin routes accept "manager", "officer" roles | LOW | These roles are never assigned |

---

## 20. AUTHENTICATION SECURITY

### Authentication Implementation

| Mechanism | Details |
|-----------|---------|
| Password hashing | bcrypt with 12 rounds ✅ |
| JWT signing | HMAC-SHA256 with configurable secret ✅ |
| JWT expiry | 24 hours (hardcoded) |
| JWT payload | `{ userId, role }` — no refresh token support |
| Phone OTP | 6-digit crypto.randomInt, 10-minute expiry |
| OTP storage | Plaintext in database (`otpCode` column) |
| Session restoration | Token stored in localStorage, verified via `GET /api/auth/me` |
| Rate limiting | Express `rate-limit` middleware: 30 req/15min for `/api/auth`, 120 req/min for `/api` |

### Security Findings

| Issue | Severity | Details |
|-------|----------|---------|
| **Token stored in localStorage** | **CRITICAL** | Not accessible to other apps via XSS, but NOT using SecureStore/Keychain for mobile. Any compromised webview or XSS can steal the token. |
| **OTP stored in plaintext** | HIGH | Database compromise reveals all user OTPs |
| **No refresh token rotation** | MEDIUM | Single token, no way to revoke without changing JWT_SECRET |
| **OTP not sent via SMS** | HIGH | Console.log only — users never receive verification codes |
| **Password reset OTP to email** | MEDIUM | Same as phone OTP — console.log only |
| **Logout doesn't invalidate token server-side** | MEDIUM | JWT remains valid until expiry |
| **No account lockout** | MEDIUM | Client-side rate limiter exists but server doesn't lock accounts |
| **Change password requires current password** | ❌ No endpoint | No change password endpoint at all |

---

## 21. MOBILE TOKEN & SECRET STORAGE

### Current Implementation

| Storage Mechanism | Used For | Security |
|------------------|----------|----------|
| `localStorage` | JWT auth token (`kuula_session_token`) | ❌ NOT SECURE on mobile — accessible to any JavaScript in WebView, not encrypted |
| `localStorage` | Onboarding flag (`kuula_onboarded`) | ✅ Low sensitivity |
| React state (in-memory) | PIN/password during login | ✅ Not persisted |

### Finding: CRITICAL

**`localStorage` is the only token storage mechanism.** Capacitor WebViews do not provide encrypted storage by default. Neither Android `EncryptedSharedPreferences` nor iOS `Keychain` is used. A stolen device or a malicious WebView injection could extract the auth token.

---

## 22. KYC & FILE STORAGE

### KYC Process

1. User enters NIN, full name, date of birth
2. User uploads front and back images of national ID (file picker, base64 encode)
3. Frontend validates: file type (JPG/PNG/WEBP), file size (≤5MB), NIN format (14-char Uganda format)
4. Backend receives base64 data URLs via `POST /api/kyc/submit`
5. Backend validates NIN format again, parses images
6. Images saved to local filesystem (`uploads/kyc/{userId}/{side}-{uuid}.{ext}`)
7. Optional Smile ID verification (fail-safe — skipped if unconfigured)
8. `KycVerified` and document references stored in user record

### Security Findings

| Issue | Severity | Details |
|-------|----------|---------|
| **Images stored on local filesystem** | HIGH | No cloud storage, no encryption at rest, no backup. Server loss = KYC data loss |
| **No public access URL protection** | HIGH | Files stored under `uploads/` with no web server configuration preventing direct access (though currently not served by any route) |
| **No authenticated retrieval endpoint** | MEDIUM | No API to fetch KYC images for admin review |
| **No file deletion on account deletion** | MEDIUM | KYC files remain on filesystem after user deletion |
| **No encryption** | MEDIUM | Images stored in plain files |
| **Smile ID integration** | ✅ Good | Fail-safe: unconfigured → manual review; configured → verifies against NIRA |
| **File size limits** | ✅ Present | Client (5MB) + Server (5MB) validation |
| **File type validation** | ✅ Present | Only JPG, PNG, WEBP |

---

## 23. NOTIFICATIONS

### Current State

| Channel | Implementation | Status |
|---------|---------------|--------|
| In-app notifications | `notifications` table, polling every 30s | ✅ Working |
| Push notifications | ❌ Not implemented | ❌ Missing |
| SMS | Console.log only (`[DEV] OTP for +256xxx: 123456`) | ❌ NOT DELIVERED |
| Email | Console.log only for password reset | ❌ NOT DELIVERED |
| WhatsApp | Not implemented | ❌ Missing |

### Notification Events

| Event | In-App | SMS | Push | Email |
|-------|--------|-----|------|-------|
| Signup OTP | ❌ | ⚠️ Console only | ❌ | ❌ |
| Account created | ❌ | ❌ | ❌ | ❌ |
| KYC submitted | ❌ | ❌ | ❌ | ❌ |
| KYC verified | ❌ | ❌ | ❌ | ❌ |
| Loan application submitted | ❌ | ❌ | ❌ | ❌ |
| Loan approved | ✅ | ❌ | ❌ | ❌ |
| Loan rejected | ✅ | ❌ | ❌ | ❌ |
| Loan disbursed | ✅ | ❌ | ❌ | ❌ |
| Payment due reminder | ❌ | ❌ | ❌ | ❌ |
| Payment received | ❌ | ❌ | ❌ | ❌ |
| Loan complete | ❌ | ❌ | ❌ | ❌ |
| Overdue notice | ❌ | ❌ | ❌ | ❌ |

**In-app notifications are created by the backend** when an admin approves/rejects a loan and when a disbursement occurs. But notification templates are basic (hardcoded strings in the route handlers).

---

## 24. COLLECTIONS & DELINQUENCY

### Implementation Status

| Feature | Status | Details |
|---------|--------|---------|
| Due date tracking | ✅ | `dueDate` set at approval |
| Overdue detection | ⚠️ PARTIAL | `status: "overdue"` exists but no automated detection |
| Days past due calculation | ❌ Not computed | No field for `days_past_due` |
| Collection queue | ❌ Not implemented | No backend endpoint for collections |
| Collection notes | ❌ Not implemented | No table or endpoint |
| Promises to pay | ❌ Not implemented | No tracking |
| Escalation | ❌ Not implemented | No automated escalation |
| Restructure | ❌ Not implemented | No loan restructure endpoint |
| Default | ❌ Not implemented | No default status or handling |
| Write-off | ❌ Not implemented | No write-off process |
| Recovery | ❌ Not implemented | No recovery workflow |

**Admin frontend screens exist** for collections (overdue loans list, collection queue, call history, notes, etc.) but **no backend endpoints back them up**. These are UI-only screens.

### Supabase Auto-Collect (DISABLED)

The `auto-collect` Edge Function is a scheduled job that:
1. Finds all due repayments
2. Checks wallet balance
3. If sufficient, deducts and marks paid
4. If insufficient, records failed attempt

But this operates on the simulated wallet balance and is disabled anyway.

---

## 25. ERROR HANDLING

### Backend Error Handling

| Error Type | Handler | HTTP Status | Response |
|-----------|---------|-------------|----------|
| Application error (`AppError`) | `errorHandler` middleware | `err.statusCode` (custom) | `{ error: message }` |
| Prisma known request error | `errorHandler` middleware | 400 | `{ error: "Database operation failed" }` |
| Unexpected error | `errorHandler` middleware | 500 | `{ error: "Internal server error", detail: err.message }` |

### Findings

| Issue | Severity | Details |
|-------|----------|---------|
| **500 errors leak `err.message`** | MEDIUM | Production responses include detail field with internal error messages |
| **Unhandled promise rejections** | HIGH | No `process.on('unhandledRejection')` handler; Node will crash on unhandled rejections (Node 16+ default behavior) |
| **Console-only error logging** | LOW | No structured logging, no error tracking service (Sentry, etc.) |
| **No user-friendly error UI** | LOW | Frontend error handling is basic (shows API error message) |
| **Swallowed errors in polling** | LOW | Polling errors are caught but silently ignored |

---

## 26. PERFORMANCE

### Assessment

| Concern | Status | Details |
|---------|--------|---------|
| App startup | ✅ Acceptable | Session bootstrap + lazy-loaded screens |
| Dashboard queries | ✅ Acceptable | 5 parallel queries (customers, pending, overdue, recent, chart) |
| Transaction list | ⚠️ Moderate | `take: 50` — unbounded without pagination |
| Customer list | ⚠️ Moderate | No pagination on admin customer list |
| Admin report | ⚠️ Heavy | Builds in-memory aggregations over all records |
| KYC image upload | ✅ Acceptable | 15MB body limit, 5MB per file |
| DB connection pool | ✅ Acceptable | Prisma default pool size |
| Background workers | ❌ None | No job queue for async processing |
| Polling | ⚠️ Moderate | 10s polling for messages, 30s for notifications — could be heavy at scale |
| API rate limiting | ✅ Present | 120 req/min general, 30 req/15min for auth |

### Database Query Optimization Opportunities

- Admin customer list fetches ALL customers without pagination
- Monthly report does sequential JS aggregation (acceptable for small datasets, problematic at scale)
- Transaction list could benefit from cursor-based pagination

---

## 27. ADMIN & BACKOFFICE

### Admin Functionality Status

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Dashboard stats | ✅ | ✅ | Working |
| Customer list | ✅ | ✅ | Working |
| Customer detail | ✅ (via app detail) | ✅ | Partial |
| KYC review | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Loan application list | ✅ | ✅ | Working |
| Loan approval | ✅ | ✅ | Working |
| Loan rejection | ✅ | ✅ | Working |
| Loan resubmission | ✅ | ✅ | Working |
| Savings overview | ✅ | ✅ | Working |
| Reports (daily/weekly/monthly) | ❌ No endpoints | ✅ Screens exist | ❌ BROKEN |
| Loan products config | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Interest settings | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Service fee config | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| MTN API settings | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Airtel API settings | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Staff management | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Notification templates | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Collections dashboard | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Audit log | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| System health | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |
| Backup/restore | ❌ No endpoint | ✅ Screen exists | ❌ BROKEN |

**The admin section has ~60 screens registered but only ~10 have working backend endpoints.** The remaining screens are frontend-only shells that will display empty data or errors.

---

## 28. AUDIT LOGGING

### Current State

| Audit Event | Logged? | Details |
|-------------|---------|---------|
| User registration | ✅ | `createdAt` in users table |
| Login | ❌ | No login event recorded |
| Phone verification | ✅ | `phoneVerified` flag set |
| KYC submission | ✅ | `kycSubmittedAt`, `kycReference` |
| Loan application | ✅ | `createdAt` in loan_applications |
| Loan approval | ⚠️ Partial | `decidedAt` set, but `approvedBy` never populated |
| Loan rejection | ⚠️ Partial | Same as approval |
| Loan acceptance | ❌ | `acceptedAt` exists in Supabase schema but not in Prisma |
| Disbursement | ✅ | Transaction recorded |
| Repayment | ✅ | Transaction + repayment update |
| Wallet action | ✅ | Transaction recorded |
| Savings action | ✅ | Transaction recorded |
| Admin decision notes | ✅ | Stored on application record |
| User deletion | ✅ | `deletedAt` soft-delete |
| User profile update | ❌ | No audit log for field changes |
| Credit limit change | ❌ | Not recorded |
| Password change | ❌ | No endpoint exists |

### Finding: No dedicated audit log table

All audit information is embedded in application tables (timestamps, status changes) rather than a dedicated `audit_logs` table. This makes it difficult to reconstruct an immutable history of events.

---

## 29. ANDROID READINESS

### Android Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Package ID | `ug.kuula.app` | ✅ Valid |
| App name | `Kuula` | ✅ |
| Version | 2.4.1 (from package.json) | ✅ |
| Target SDK | 34+ (Capacitor 7 default) | ✅ |
| Minimum SDK | 22 (Capacitor 7 default) | ✅ (Android 5.1+) |
| Allow mixed content | `false` | ✅ (HTTPS enforced) |
| WebView debugging | `false` | ✅ (disabled for release) |
| Splash screen | Custom coral (#F4612B) | ✅ |
| Launcher icon | Custom (kuula-icon-1024.png) | ✅ |
| Adaptive icon | Not explicitly configured | ⚠️ May use default |
| Notification icon | Not configured | ⚠️ May use default |
| Secure storage | localStorage only | ❌ CRITICAL |

### Google Play Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **No real payment provider** | **CRITICAL** | Google Play requires lending apps to have verifiable disbursement/repayment processes |
| **Minimum term 90 days** | ✅ Compliant | Google requires ≥60 days — Kuula uses 90 |
| **APR capped at 33.6%** | ✅ Compliant | Well within guidelines |
| **No SMS/receive SMS permission** | ✅ Not requested | No unnecessary permissions |
| **Token in localStorage** | MEDIUM | Play review may flag insecure storage |
| **No privacy policy link** | HIGH | Terms screen exists but privacy policy content not verified |
| **Account deletion** | ✅ Implemented | Soft-delete via API |

---

## 30. IOS READINESS

### iOS Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Bundle ID | `ug.kuula.app` | ✅ Valid |
| App name | `Kuula` | ✅ |
| Version | 2.4.1 | ✅ |
| Build | Not explicitly set | ⚠️ |
| Deployment target | iOS 13+ (Capacitor 7 default) | ✅ |
| Content inset | `automatic` | ✅ |
| Scroll enabled | `false` | ✅ (conflicts with in-app scroll) |
| Privacy descriptions | Not configured | ❌ Required for camera, photo library |

### Apple App Store Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **No real payment provider** | **CRITICAL** | Apple requires lending apps to demonstrate actual loan lifecycle |
| **APR capped at 33.6%** | ✅ Compliant | Apple requires ≤36% — Kuula is at 33.6% |
| **Minimum term 90 days** | ✅ Compliant | Above any minimum |
| **Privacy descriptions missing** | **CRITICAL** | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` must be in Info.plist |
| **Account deletion** | ✅ Implemented | Apple 5.1.1(v) requires account deletion — soft-delete API exists |
| **Token in localStorage** | MEDIUM | iOS WebView doesn't use Keychain |

---

## 31. WEB READINESS

### Web Configuration

| Setting | Status | Notes |
|---------|--------|-------|
| PWA manifest | ✅ `manifest.webmanifest` | Present |
| Service worker | ❌ Not implemented | No offline support |
| Favicon | ✅ Custom (256px) | |
| Responsive layout | ✅ | Mobile-first with max-width 480px |
| SEO robots meta | ✅ | Blocks index in dev, allows in prod |
| Direct URL access | ⚠️ HashRouter | All routes are hash-based, no server-side routing needed |
| Session restoration | ✅ | localStorage token, /me endpoint |
| Browser navigation | ✅ | HashRouter handles back/forward |

### Web Findings

- **Fully functional web app** — Can be deployed as a PWA with Vite build
- **No service worker** — No offline capability
- **HashRouter prevents clean URLs** — `/welcome` instead of `/welcome`
- **Mobile-first design** — Desktop view shows centered phone column

---

## 32. BRANDING & ASSETS

### Brand Assets Found

| Asset | Custom? | Notes |
|-------|---------|-------|
| Android launcher icon | ✅ Custom | `assets/kuula-icon-1024.png`, `assets/kuula-icon-512.png`, `assets/kuula-icon-256.png` |
| Adaptive icon | ⚠️ Not explicit | No dedicated adaptive icon config |
| iOS icon | ✅ Custom | Same sources |
| Splash (coral) | ✅ Custom | `assets/kuula-splash-coral.png` |
| Splash (cream) | ✅ Custom | `assets/kuula-splash-cream.png` |
| Splash (ink) | ✅ Custom | `assets/kuula-splash-ink.png` |
| Logo (dark) | ✅ Custom | `assets/kuula-logo-dark.png` |
| Logo (light) | ✅ Custom | `assets/kuula-logo-light.png` |
| Favicon | ✅ Custom | `public/favicon-256.png` |
| Notification icon | ⚠️ Not set | May use default Android/iOS |
| PWA icon | ✅ Custom | `public/kuula-tile-green-1024.png` |
| Admin logo | ✅ Custom | Uses `src/imports/kuula-tile-1024.png` |

### Findings

- **No Expo default assets found** — All assets appear to be custom Kuula branding ✅
- **Color consistency** — Coral (#F4612B) used consistently across app ✅
- **Tile icon used in admin** — Custom tile image ✅
- **No stretched or poor resolution assets** found ✅

---

## 33. UI/UX QUALITY

### Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Typography | ✅ Good | System font stack, consistent sizes |
| Color scheme | ✅ Good | Coral primary, green success, red danger |
| Buttons | ✅ Good | Consistent height, radius, gradient styling |
| Forms | ✅ Good | Labels, validation states, error messages |
| Cards | ✅ Good | Rounded corners, subtle shadows |
| Icons | ✅ Good | Lucide icons with consistent sizing |
| Navigation (customer) | ✅ Good | Bottom tab bar with 5 tabs |
| Navigation (admin) | ✅ Good | Collapsible sidebar with sections |
| Loading states | ✅ Good | Spinner for lazy screens, per-section loading |
| Empty states | ✅ Good | "No transactions yet", "No applications yet" |
| Error states | ✅ Good | Red text, retry available |
| Date formatting | ✅ Good | Locale-aware |
| Currency formatting | ✅ Good | "UGX X,XXX,XXX" convention |
| Phone formatting | ✅ Good | "+256 XXX XXX XXX" |
| Touch targets | ✅ Good | Buttons 44px+ height |
| Safe areas | ✅ Good | `env(safe-area-inset-top/bottom)` |

### Minor Issues

- Some screens lack `paddingBottom: 80` for bottom nav scrolling
- Admin sidebar scrollbar hidden (`scrollbarWidth: "none"`)

---

## 34. PRIVACY & APP STORE READINESS

### Privacy Checklist

| Requirement | Status | Details |
|-------------|--------|---------|
| Privacy Policy URL | ⚠️ EXISTS | `customer-privacy-policy` screen registered, content not verified |
| Terms of Service URL | ⚠️ EXISTS | `customer-terms` screen registered, content not verified |
| Account deletion | ✅ Implemented | Soft-delete via API |
| Data deletion request | ⚠️ Partial | No UI for deletion request submission |
| Permission explanation | ❌ Missing | No rationale strings for camera/photo access |
| Support/Contact | ✅ EXISTS | Support screens registered |
| No demo credentials in production | ⚠️ | `REVIEWER_MODE` flag must be disabled for production |
| No placeholder legal links | ⚠️ | Legal screens exist but content not verified |

### App Store Readiness

| Store | Status | Blocking Issues |
|-------|--------|-----------------|
| Google Play | ❌ NOT READY | No real money movement, missing privacy policy |
| Apple App Store | ❌ NOT READY | No real money movement, missing privacy descriptions, missing Keychain |

---

## 35. PRODUCTION CONFIGURATION

### Environment Variables

| Variable | Default | Production Required | Notes |
|----------|---------|-------------------|-------|
| `DATABASE_URL` | Local PostgreSQL | ✅ Yes | Must point to production DB |
| `JWT_SECRET` | "change-me" | ✅ Yes | Must be strong random |
| `PORT` | 3000 | ⚠️ Optional | |
| `SMILE_PARTNER_ID` | "" | ⚠️ Optional | For KYC verification |
| `SMILE_API_KEY` | "" | ⚠️ Optional | For KYC verification |
| `SMILE_ENV` | "sandbox" | ✅ Must be "production" | |
| `KYC_STORAGE_DIR` | "uploads/kyc" | ⚠️ Optional | Should use cloud storage |
| `VITE_API_BASE_URL` | "http://localhost:3000" | ✅ Must be production HTTPS |
| `VITE_USE_API` | "false" | ✅ Must be "true" |
| `VITE_APP_ENV` | "development" | ✅ Must be "production" |
| `VITE_REVIEWER_MODE` | "false" | ✅ Must be "false" |

### Search Results for Anti-Patterns

| Pattern | Occurrences | Status |
|---------|------------|--------|
| `localhost` | Many (config defaults) | ⚠️ Must be replaced in production |
| `127.0.0.1` | 0 | ✅ |
| `sandbox` | SMILE_ENV default | ⚠️ Must be "production" |
| `TODO` | In code comments | LOW |
| `FIXME` | Not found | ✅ |
| `debug` | Not found in prod code | ✅ |
| Hardcoded secrets | 0 | ✅ |

### Production Deployment Gaps

| Requirement | Status | Details |
|-------------|--------|---------|
| HTTPS | ⚠️ Not configured | No TLS in Express |
| CORS | ⚠️ Accepts all when no CORS_ORIGINS | Falls back to `true` (allow all) |
| Database migrations | ✅ Via Prisma | |
| Health check | ✅ `/api/health` | |
| Graceful shutdown | ✅ SIGTERM/SIGINT | |
| Monitoring | ❌ Not configured | No logging service, no APM |
| Error reporting | ❌ Not configured | No Sentry, no bugsnag |
| Backup strategy | ❌ Not documented | No backup process |
| Rate limiting | ✅ Present | |
| Containerization | ❌ No Dockerfile | |
| CI/CD | ❌ Not found | No pipeline config |

---

## 36. DEPENDENCIES & BUILD HEALTH

### TypeScript Configuration

| Setting | Status |
|---------|--------|
| `strict: true` | ✅ |
| `noEmit: true` | ✅ (Vite handles build) |
| `skipLibCheck: true` | ✅ |
| Build command | `vite build` — exits on error |

### Test Configuration

| Setting | Status |
|---------|--------|
| Test runner | Vitest |
| Test files found | 4 |
| Test coverage | Minimal (NIN, pricing, rate-limiter, context) |

### Existing Tests

| Test File | What It Tests | Assertions |
|-----------|--------------|------------|
| `src/app/lib/nin.test.ts` | Uganda NIN validation | Accepts correct format, rejects wrong length/format |
| `src/app/lib/pricing.test.ts` | Loan pricing logic | APR cap, minimum term, simple interest, savings discount |
| `src/app/lib/rate-limiter.test.ts` | Rate limiter class | Max attempts, reset, pruning |
| `src/app/context/AppContext.test.ts` | State reducer | LOGIN, LOGOUT, UPDATE_PROFILE, message operations |

### Test Coverage Gaps

| Critical Area | Coverage |
|---------------|----------|
| Authentication (signup, login, OTP) | ❌ Zero |
| Authorization (role guards) | ❌ Zero |
| Borrower isolation (IDOR) | ❌ Zero |
| Loan application | ❌ Zero |
| Approval/disbursement | ❌ Zero |
| Repayment | ❌ Zero |
| Credit scoring | ❌ Zero |
| API endpoints (integration) | ❌ Zero |
| Database operations | ❌ Zero |
| Smile ID integration | ❌ Zero |
| Payment webhook | ❌ Zero |

---

## 37. END-TO-END BORROWER JOURNEY

### Trace (Actual Implementation)

| Step | Screen | Working? | Notes |
|------|--------|----------|-------|
| 1. Install/Open App | Onboarding (first launch) | ✅ | Carousel slides |
| 2. Navigate to Create Account | `/create-account` | ✅ | Form with validation |
| 3. Fill Name, Phone, Email, NIN, Password | Same | ✅ | Full validation |
| 4. Accept Terms | Same | ✅ | Checkbox required |
| 5. Submit | Same | ✅ | Creates user, shows phone-verify |
| 6. Enter OTP | `/phone-verify` | ⚠️ | OTP is console.logged — user can't receive it |
| 7. Complete KYC | `/kyc` | ✅ | Works with API call |
| 8. View Home | `/home` | ✅ | Shows dashboard |
| 9. Apply for Loan | `/loan-apply` | ✅ | Amount, term, purpose, method |
| 10. Review Application | `/loan-review` | ✅ | Shows summary |
| 11. Submit Application | Same | ⚠️ | In mock mode: navigates to loan-approval with success. In real mode: calls API. |
| 12. Wait for Admin Approval | — | ⚠️ | Admin must manually approve |
| 13. Receive Notification | — | ⚠️ | In-app only |
| 14. View Active Loan | `/loan-detail` | ✅ | Shows details |
| 15. Make Partial Repayment | `/make-payment` | ⚠️ | Deducts from in-app wallet, no real MoMo |
| 16. Make Final Repayment | Same | ⚠️ | Same issue |
| 17. Loan Completed | — | ⚠️ | Status changes to "paid" |
| 18. View History | `/loan-history` | ✅ | Lists past loans |
| 19. Logout | Settings | ✅ | Clears session |
| 20. Login Again | `/welcome` | ✅ | Restores from localStorage token |

### Journey Breaking Points

| Step | Blocking Issue | Severity |
|------|----------------|----------|
| 6. Phone Verification | OTP not sent via SMS — user never receives code | **CRITICAL** |
| 9. Loan Disbursement | No real MoMo payout — wallet credit only | **CRITICAL** |
| 15-16. Repayment | No real MoMo collection — wallet debit only | **CRITICAL** |
| 12. Admin Approval | No notification to admin when new application submitted | HIGH |
| 3. NIN Requirement | NIN is required to create account, but this may be a barrier for users without NIN | MEDIUM |

---

## 38. END-TO-END ADMIN JOURNEY

| Step | Working? | Notes |
|------|----------|-------|
| 1. Admin Login (email + password) | ✅ | Separate login form |
| 2. Dashboard Overview | ✅ | Stats, chart, recent apps |
| 3. View Customer List | ✅ | All customers |
| 4. View Customer Detail | ⚠️ Partial | No dedicated customer detail endpoint — uses loan application data |
| 5. Review KYC | ✅ | KYC status endpoint exists |
| 6. View Pending Applications | ✅ | Loan application list |
| 7. Approve Application | ✅ | API call works, but **disburses simulated money** |
| 8. Reject Application | ✅ | With notes |
| 9. Monitor Active Loans | ✅ | Active loan list |
| 10. Generate Report | ✅ | PDF download |
| 11. Manage Collections | ❌ | Backend endpoints missing |
| 12. Configure Products | ❌ | Frontend-only screens |

---

## 39. FINANCIAL ADVERSARIAL TEST PLAN

### Without Actually Testing on Production, Code Analysis Reveals:

| Attack Vector | Vulnerability | Severity | Details |
|---------------|---------------|----------|---------|
| Duplicate application | ⚠️ POSSIBLE | MEDIUM | No unique constraint prevents same user from submitting multiple pending applications |
| Duplicate approval | ⚠️ POSSIBLE | **CRITICAL** | Admin approve route checks `status: "pending"` but no idempotency key. Two concurrent requests could both pass. |
| Duplicate disbursement | ⚠️ POSSIBLE (Node backend) | **CRITICAL** | No check if a loan has already been disbursed. The same loan could be approved twice by two admin requests. |
| Fake provider callback | ✅ NOT POSSIBLE | — | No provider callbacks in Node backend to fake |
| Duplicate callback | ✅ NOT POSSIBLE | — | No callback receiver in Node backend |
| Replayed callback | ✅ NOT POSSIBLE | — | No callback receiver in Node backend |
| Wrong repayment amount | ✅ PARTIALLY PROTECTED | MEDIUM | Backend clamps and validates amount |
| Payment attributed to wrong loan | ✅ PROTECTED | — | Always scoped to authenticated user |
| Concurrent repayments | ⚠️ **VULNERABLE** | **CRITICAL** | No row-level locking on wallet balance. Two simultaneous requests could both pass the balance check and over-deduct (leading to negative balance). However, wallet can go negative because no check constraint. |
| Overpayment | ⚠️ PARTIAL | MEDIUM | `amountPaid` is capped at `total` |
| Repayment after loan completion | ✅ PROTECTED | — | No unpaid repayment record |
| Disbursement of rejected loan | ✅ PROTECTED | — | Status check prevents |
| Unauthorized limit changes | ✅ PROTECTED | — | Credit limit is computed server-side, not stored |

---

## 40. LAUNCH BLOCKERS

### CRITICAL Issues (Must Fix Before Any Real User)

| ID | Issue | Component | Impact |
|----|-------|-----------|--------|
| **C-01** | **No real disbursement** — Node backend credits an in-app wallet instead of sending MoMo | Backend/Loans | Users receive no real money. Entire lending product is simulated. |
| **C-02** | **No real repayment** — Node backend deducts from in-app wallet instead of collecting MoMo | Backend/Loans | Users never repay real debt. No cash flow. |
| **C-03** | **Token in localStorage** — Auth tokens stored in browser storage, not Keychain/SecureStore | Mobile/Storage | Token theft via XSS or device compromise. |
| **C-04** | **OTP not sent via SMS** — Verification codes console.logged only, never transmitted | Backend/Auth | Users cannot complete registration. |
| **C-05** | **Dual backend confusion** — Supabase has correct real-money flow but is disabled. Node backend has simulated-only flow. | Architecture | The real-money integration exists but is completely disconnected. |
| **C-06** | **Concurrent admin approval can double-disburse** — No idempotency on approve route | Backend/Admin | A loan can be approved twice, creating duplicate disbursement and double wallet credit. |
| **C-07** | **Wallet balance can go negative** — No DB-level check constraint on wallet balance | Database/Wallet | Race conditions or bugs can create negative balances, breaking financial integrity. |
| **C-08** | **No payment provider callback/webhook receiver in Node backend** — Even with MarzPay integration, the Node server has no webhook endpoint | Backend | No way to settle real payment outcomes. |

### HIGH Issues (Must Fix Before Production)

| ID | Issue | Component | Impact |
|----|-------|-----------|--------|
| **H-01** | **No SMS infrastructure** — All notifications except in-app are missing | Notifications | Users not notified of approval, disbursement, due dates, overdue |
| **H-02** | **No push notifications** — Mobile push not configured | Notifications | No real-time alerts |
| **H-03** | **No account lockout on failed login** — Server doesn't lock after N attempts | Auth | Brute force attack vector |
| **H-04** | **JWT cannot be revoked** — No token blacklist, no refresh rotation | Auth | Stolen tokens valid for 24h |
| **H-05** | **Unhandled promise rejections crash server** — No `unhandledRejection` handler | Backend | Server can crash due to async errors |
| **H-06** | **KYC images stored unencrypted on local filesystem** — No cloud storage, no encryption | KYC/Storage | Data loss risk, compliance issue |
| **H-07** | **Missing iOS privacy descriptions** — Camera/photo library not described in Info.plist | iOS | App Store rejection |
| **H-08** | **Admin screens without backend endpoints** — ~50 admin screens have no working API | Admin | Broken functionality for critical operations |
| **H-09** | **No audit log table** — Cannot reconstruct financial events history | Compliance | Regulatory risk |
| **H-10** | **`getConfigErrors()` blocks production if `VITE_USE_API=false`** — But .env.example has false by default | Config | Required env check is good, but documentation could lead to misconfiguration |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| M-01 | No change password endpoint |
| M-02 | No email service for password reset |
| M-03 | Admin `approvedBy` field never populated |
| M-04 | No pagination on admin endpoints |
| M-05 | N+1 query potential in admin report builder |
| M-06 | No loan product configuration API |
| M-07 | No interest calculation configuration API |
| M-08 | OTP stored in plaintext in database |
| M-09 | Prisma schema missing CHECK constraints present in Supabase migrations |
| M-10 | No referential integrity on `repayments.loanId` (string, not FK) |

---

## 41. RECOMMENDED REMEDIATION ORDER

### Phase 1 — Foundation (Must Do Before Any Real User)

1. **C-01 / C-02**: Decide on backend architecture — either build real MoMo integration into the Node backend OR enable Supabase Edge Functions and connect the frontend to them
2. **C-04**: Integrate an SMS provider (e.g., Africa's Talking, Twilio) for real OTP delivery
3. **C-07**: Add `CHECK (balance >= 0)` constraint to wallet table
4. **C-06**: Add idempotency key to loan approval route
5. **C-03**: Replace localStorage with secure storage for tokens:
   - iOS: Keychain via Capacitor Secure Storage plugin
   - Android: Encrypted SharedPreferences via Capacitor Secure Storage plugin
   - Web: httpOnly cookies (if applicable)
6. **H-05**: Add `process.on('unhandledRejection')` handler

### Phase 2 — Operations (Before Scale)

7. **H-01**: Integrate SMS provider for all notification events
8. **H-02**: Add push notifications (FCM for Android, APNS for iOS)
9. **H-03**: Add server-side account lockout
10. **H-04**: Implement token refresh rotation
11. **H-06**: Migrate KYC image storage to cloud (S3/Supabase Storage) with signed URLs
12. **H-09**: Create audit_log table and log all financial + admin actions
13. **H-08**: Build backend endpoints for critical admin screens (collections, audit log, system health)

### Phase 3 — Store Readiness

14. **H-07**: Add iOS privacy usage descriptions to Info.plist
15. Add privacy policy URL and terms of service URL
16. Verify all brand assets meet store guidelines
17. Configure production environment variables
18. Add crash reporting (Sentry)
19. Add monitoring (health checks, uptime monitoring)

### Phase 4 — Launch

20. Create test coverage for all critical paths
21. Perform penetration testing on authorization
22. Load test database and API endpoints
23. Set up CI/CD pipeline
24. Prepare store listing assets and descriptions

---

## FINAL VERDICT

| Component | Status | Blocking Issues |
|-----------|--------|----------------|
| **ANDROID** | ❌ NOT READY | C-01, C-02, C-03, C-04 |
| **IOS** | ❌ NOT READY | C-01, C-02, C-03, C-04, H-07 |
| **WEB** | ⚠️ PARTIALLY READY | C-01, C-02, C-04 (functional as a UI demo only) |
| **BACKEND** | ❌ NOT READY | C-01, C-02, C-05, C-06, C-08 |
| **DATABASE** | ⚠️ PARTIALLY READY | C-07, M-09, M-10 (schema needs hardening) |
| **AUTH** | ❌ NOT READY | C-03, C-04, H-03, H-04 |
| **CREDIT ENGINE** | ✅ READY | (Functionally complete, though inputs are unverified) |
| **DISBURSEMENTS** | ❌ NOT READY | C-01 (No real payout — simulated wallet credit only) |
| **REPAYMENTS** | ❌ NOT READY | C-02 (No real collection — simulated wallet debit only) |
| **PAYMENTS** | ❌ NOT READY | C-01, C-02, C-08 (No payment provider integrated) |
| **KYC/PRIVACY** | ⚠️ PARTIALLY READY | H-06 (local filesystem storage), missing privacy descriptions |
| **GOOGLE PLAY** | ❌ NOT READY | C-01, C-04 |
| **APPLE APP STORE** | ❌ NOT READY | C-01, C-04, H-07 |
| **OVERALL** | ❌ **NOT READY** | See all CRITICAL and HIGH issues above |

### Summary

Kuula has a **well-engineered frontend** with a complete, polished UI and a **well-structured Node backend** for non-financial operations. The credit scoring engine is reasonable, compliance settings (APR 33.6%, min term 90 days) satisfy both Apple and Google requirements, and the codebase demonstrates good engineering practices.

However, the application **does not move real money**. Loan disbursements credit an in-app wallet (a database column), and repayments deduct from the same simulated balance. The Supabase Edge Functions implement correct MarzPay real-money integration — but the frontend has them disabled.

The app will function as a **demo/simulation** but is **not ready for production lending** with real users, real loans, real disbursements, and real repayments. The core financial pipeline must be connected to a real payment provider before anyone can genuinely borrow or repay money through Kuula.
