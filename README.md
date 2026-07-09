<div align="center">

# Kuula

**The lending app for Ugandans the banks ignore.**

Instant micro-loans and goal-based savings delivered straight to
MTN MoMo or Airtel Money — no branch visits, no paperwork, no collateral.

</div>

---

## The Problem

Over **70% of Ugandans are unbanked or underbanked.** Most adults have never
had a formal credit history, which means traditional banks won't lend to them.
When a market vendor needs UGX 200,000 to restock, or a boda-boda rider needs
UGX 50,000 for fuel, their only options are loan sharks charging 20–30% per
*month* or informal savings groups (NDOBs) that can take weeks to disburse.

The result is a **credit vacuum** — millions of hard-working Ugandans are locked
out of affordable credit because they don't fit a bank's risk model. Mobile money
(used by over 30 million Ugandans) already connects them to the financial system,
but nobody is using that rail to lend responsibly.

## How Kuula Solves It

Kuula turns a borrower's **mobile money activity and app behavior** into a credit
signal — no collateral, no bank statements, no credit bureau. The entire
lifecycle happens on a phone:

1. **Sign up in 60 seconds** — phone number + PIN, verified by OTP.
2. **Get a credit decision in real time** — our scoring model evaluates
   repayment ability instantly, not based on traditional credit history.
3. **Receive funds directly on MTN MoMo or Airtel Money** — no bank account
   needed. The money arrives as a mobile-money deposit the borrower can
   immediately use.
4. **Repay on your own schedule** — make a full repayment or pay a partial
   amount from your mobile-money wallet. Auto-collection sweeps handle
   overdue amounts.
5. **Build a credit history** — every on-time repayment improves the user's
   Kuula credit score, unlocking larger limits over time.

### Why this matters

| | Banks & SACCOs | Loan sharks | **Kuula** |
|---|---|---|---|
| **Collateral** | Land titles, payslips | None (but 30%/mo) | **None** |
| **Time to funds** | Days to weeks | Minutes | **Minutes** |
| **APR** | 20–30% | 240–360% | **≤ 33.6%** (UMRA cap) |
| **Apply from** | Branch | In person | **Your phone** |
| **Disbursement** | Bank account | Cash | **MoMo / Airtel** |
| **Credit building** | Yes | No | **Yes** |

## Who Kuula Is For

### Borrowers (Customers)

- **Market vendors, traders, and small business owners** who need working
  capital to restock inventory between market days.
- **Boda-boda riders, taxi drivers, and gig workers** who need cash for fuel,
  repairs, or emergencies and can repay from daily earnings.
- **Salaried workers** waiting for payday who need a short-term bridge for
  school fees, rent, or medical costs.
- **Anyone with an MTN MoMo or Airtel Money wallet** and a phone — no bank
  account required.

### Operators (Admin)

- **Loan officers** who review applications, approve or decline loans, and
  initiate disbursements.
- **Collections teams** tracking overdue repayments and triggering
  auto-collection sweeps via mobile money.
- **Support staff** handling customer inquiries, disputes, and account issues.
- **Management** viewing dashboards for portfolio health, disbursement
  volumes, and compliance reporting.

## Key Features

### For borrowers
- **Instant loans** — apply, get approved, receive funds on mobile money in
  minutes, not days.
- **Flexible repayment** — pay the full balance or any partial amount; the
  app calculates remaining interest accurately.
- **Goal-based savings** — create savings goals (school fees, emergency fund),
  set auto-save rules, and track progress visually.
- **Wallet & transaction history** — top up, view balances, and see every
  transaction with clear descriptions.
- **Credit score dashboard** — see your score, understand what affects it,
  and get actionable tips to improve it.
- **Transparent pricing** — every loan shows the exact total cost before you
  accept. No hidden fees, no compounding interest, APR capped by regulation.
- **3 languages** — full UI in **English, Luganda, and Swahili** so users
  interact in the language they're most comfortable with.
- **Biometric login** — unlock the app with your fingerprint or face on
  supported devices.

### For operators
- **Full loan lifecycle management** — application review, approval workflow,
  disbursement, repayment tracking, and collections.
- **Real-time dashboards** — portfolio health, active loans, disbursement
  volumes, and delinquency rates at a glance.
- **Customer management** — search, view profiles, manage savings accounts,
  and handle support tickets.
- **Compliance tools** — pricing guardrails enforced at build time (APR cap,
  minimum term, simple interest only), audit-ready reporting.

## How It Works (User Journey)

```
  Download app          Verify phone          Apply for loan
  ──────────────►  ────────────────►  ─────────────────►
   (Play Store /      (OTP via SMS)      (amount, purpose,
    App Store)                               duration)

  Credit decision       Receive funds         Repay on
  ──────────────►  ────────────────►  ────────────►
  (real-time         (straight to         (full or partial,
   scoring)          MTN/Airtel MoMo)      via mobile money)

  Credit score        Unlock higher        Repeat &
  improves  ◄────   limits next time  ◄──── save goals
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Mobile** | Capacitor (single codebase → Android APK + iOS IPA + PWA) |
| **Backend** | Supabase (Postgres + Auth + Row-Level Security + Edge Functions) |
| **Payments** | MarZPay → MTN MoMo & Airtel Money (collections + disbursements) |
| **CI/CD** | GitHub Actions (typecheck, test, build, signed APK/AAB/IPA) |
| **Languages** | react-i18next (English, Luganda, Swahili) |

## Quick Start

### Demo mode (no backend needed)

```bash
npm install            # install dependencies
npm run dev            # start dev server → http://localhost:5000
```

The app works fully offline with two demo accounts:

| Account | How to log in | PIN |
|---------|---------------|-----|
| Amara Nakato (customer) | Tap **USER** | `1234` |
| Admin Kavuma (operator) | Tap **ADMIN** | `1234` |

### Production mode (with Supabase)

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key
npm run build
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full production setup guide
(Supabase, Capacitor, app store submission, signing keys).

## Project Structure

```
src/
  app/
    components/screens/    # All app screens (customer + admin)
    api/                   # Supabase client & service layer
    context/               # App state (user, loans, credit, wallet)
    lib/                   # Pricing engine, receipt generator, exports
    screens/registry.ts    # Screen routing & access control
  i18n/locales/            # English, Luganda, Swahili translations
  styles/                  # Tailwind + theme CSS
supabase/
  functions/               # Edge Functions (MarZPay, credit scoring, collections)
  migrations/              # Database schema (5 migrations)
android/                   # Capacitor Android project
ios/                       # Capacitor iOS project
```

## Compliance & Safety

- **No fabricated financial data.** In production, every balance, loan, and
  transaction comes from the backend — the app shows clear error/empty states
  rather than placeholder numbers.
- **Pricing guardrails.** APR is hard-capped at 33.6% (UMRA limit), minimum
  loan term is 90 days, and interest is simple (never compounded). These
  rules are verified automatically on every build.
- **Fail-closed security.** Sensitive operations (webhook processing, payments)
  reject requests when required secrets are missing rather than proceeding
  without verification.
- **No secrets in the bundle.** Server-side keys (MarZPay, JWT, Supabase
  service role) live only as Edge Function secrets — never as `VITE_*` env
  vars.

## License

Proprietary — © Kuula Ltd.