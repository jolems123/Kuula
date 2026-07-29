# Kuula — Authoritative Backend & Payment Architecture

**Status:** ADOPTED
**Date:** 2026-07-29
**Scope:** Resolves C-05 (dual backend confusion). Prerequisite for C-01, C-02, C-06, C-08.

---

## 1. The problem

Kuula currently has two candidate backends:

| | Node/Express (`server/`) | Supabase Edge Functions (`supabase/functions/`) |
|---|---|---|
| Runtime | Node 20 + Express 5 + Prisma | Deno, serverless |
| Database | PostgreSQL via Prisma | PostgreSQL via PostgREST + SQL triggers |
| Auth | Own JWT (`server/src/middleware/auth.ts`) | Supabase Auth (`auth.users`) |
| Reachable from the app? | **Yes** — `src/app/api/client.ts` calls it exclusively | **No** — `src/app/lib/supabase.ts` hardcodes `isSupabaseConfigured = false` and `requireSupabase()` throws |
| Loan state | Authoritative | Orphaned |
| Real money | **None** (simulated wallet credit/debit) | Real MarzPay disburse/collect/webhook |

The financial logic that actually works lives in the backend nothing can call; the backend the
app talks to only moves numbers in a `wallets` table.

### What exists ONLY in Supabase

Audited file by file:

| Capability | File | Ported to Node? |
|---|---|---|
| MarzPay HTTP client (Basic auth, phone normalisation, disburse/collect) | `_shared/marzpay.ts` | **Yes** → `server/src/lib/marzpay.ts` |
| Borrower-accepts-offer → real payout, with `accepted_at` compare-and-set lock | `marzpay-disburse/index.ts` | **Yes** → `server/src/lib/disbursement.ts` |
| Borrower-initiated request-to-pay, records PENDING only | `marzpay-collect/index.ts` | **Yes** → `server/src/lib/repayment.ts` |
| Async callback settlement, claim-off-pending idempotency | `marzpay-webhook/index.ts` | **Yes** → `server/src/routes/webhooks.ts` (hardened further) |
| Auto-collection sweep of due loans | `auto-collect/index.ts` | **Yes** → `server/src/lib/repayment.ts` (`sweepDueRepayments`) |
| Credit scoring | `credit-score/index.ts` | Already in Node (`server/src/lib/credit-score.ts`) — unchanged, per remediation scope |
| `on_loan_decision` booking trigger, RLS policies, retention jobs | `supabase/migrations/*.sql` | Equivalent behaviour implemented in Node service layer + Prisma migration |

Nothing in Supabase was business logic that Node lacks a home for. The only real gap was the
**payment provider integration itself**, which is portable HTTP.

### What exists ONLY in Node

- All 9 route modules the app actually consumes (`auth`, `loans`, `savings`, `messages`,
  `transactions`, `goals`, `notifications`, `admin`, `kyc`)
- KYC: Uganda NIN validation, Smile ID Enhanced KYC, ID image storage
- Pricing/compliance engine (`lib/pricing.ts`, `lib/compliance.ts`)
- Admin approval workflow and investor reporting

Migrating this to Deno would be a rewrite of the entire application. Migrating MarzPay to Node
is ~300 lines of HTTP client + settlement logic.

---

## 2. Decision

> **The Node/Express backend in `server/` is the single authoritative backend for loan state,
> disbursement, repayment, payment verification, webhooks, and all financial transactions.**
>
> **The Supabase Edge Functions are retired.** They are not enabled, not deployed, and are kept
> only as a read-only reference until the Node implementation has run in production for one
> reconciliation cycle.

Rationale:

1. Node is already the active application backend. It owns auth, users, loans and KYC. Two
   systems owning loan state is the root of C-05 and would make C-06 unfixable.
2. The Supabase functions authenticate against `auth.users`, which Kuula does not use — the app
   authenticates with its own JWT. Enabling them would require a parallel identity system.
3. Payment provider integration is the smaller, more portable half.
4. One backend means one database transaction boundary. Financial correctness (C-06, C-07, C-08)
   depends on `SELECT … FOR UPDATE` and unique constraints inside a single transactional store.
   Splitting money movement across Deno and Node makes exactly-once effects impossible to
   guarantee.

### Enforcement

- `supabase/functions/**` carries a `RETIRED.md` notice and each function short-circuits with
  HTTP 410 unless `SUPABASE_FUNCTIONS_ENABLED=true` (which is never set).
- `src/app/lib/supabase.ts` stays a throwing shim — the client cannot reach Supabase.
- `server/src/lib/marzpay.ts` refuses to start in production without credentials, so there is no
  silent fallback to simulation.

---

## 3. Target money-movement architecture

Every peso of real money moves through one of two flows, both of which are **two-phase**: an
initiation that can only create a `pending` record, and a provider-confirmed settlement that is
the *only* thing allowed to produce a financial effect.

```
DISBURSEMENT (money out)

  admin approves            borrower accepts          server                MarzPay
  ─────────────────────────────────────────────────────────────────────────────────────
  POST /admin/loans/:id/approve
    └─ tx: SELECT FOR UPDATE application
       status pending -> offered           (no money, no wallet credit)

                          POST /loans/:id/accept
                            └─ tx: SELECT FOR UPDATE application
                               claim: status offered -> disbursing
                                      accepted_at NULL -> now()      ← the lock
                               insert Transaction{ type: loan_disbursement,
                                                   status: pending,
                                                   reference: LOAN-<appId>,
                                                   idempotencyKey } ← UNIQUE
                            └─ POST MarzPay /disbursements  (amount from DB, never client)
                            └─ persist providerRef
                            └─ 202 { status: "pending" }             ← loan NOT disbursed yet

                                                     POST /api/webhooks/marzpay
                                                       └─ verify HMAC signature + timestamp
                                                       └─ record WebhookEvent (UNIQUE eventId)
                                                       └─ tx: SELECT FOR UPDATE transaction
                                                          claim pending -> completed
                                                          verify amount, type, currency
                                                       └─ application -> active, disbursedAt
                                                       └─ schedule Repayment
                                                       └─ audit + notification
```

```
REPAYMENT (money in)

  borrower                  server                              MarzPay
  ─────────────────────────────────────────────────────────────────────────────────────
  POST /loans/repayment/pay
    └─ tx: SELECT FOR UPDATE repayment
       server computes payable = total - amountPaid  ← client amount is only a CAP
       reject if loan already paid / nothing due
       reject if an in-flight pending collection exists   ← duplicate-request guard
       insert Transaction{ type: loan_payment, status: pending,
                           reference: REPAY-<repaymentId>-<n>, idempotencyKey } ← UNIQUE
    └─ POST MarzPay /collections
    └─ 202 { status: "pending", isPending: true }   ← balance UNCHANGED

                            POST /api/webhooks/marzpay
                              └─ verify HMAC + timestamp + replay window
                              └─ record WebhookEvent (UNIQUE eventId)  ← replay/duplicate
                              └─ tx: SELECT FOR UPDATE transaction
                                 claim pending -> completed  ← exactly-once
                                 verify amount matches the pending txn
                                 allocate to repayment (capped at outstanding)
                                 if fully paid: repayment -> paid, loan -> paid
                              └─ receipt + notification
```

### Invariants enforced at the database

| Invariant | Mechanism |
|---|---|
| A loan is disbursed at most once | Partial unique index on `transactions(loan_id)` where `type='loan_disbursement' AND status IN ('pending','completed')` |
| A repayment has at most one in-flight collection | Partial unique index on `transactions(loan_id)` where `type='loan_payment' AND status='pending'` |
| A callback is processed at most once | `webhook_events.event_id` UNIQUE + `transactions.status` compare-and-set off `pending` inside `SELECT … FOR UPDATE` |
| A retried request creates at most one payout | `transactions.idempotency_key` UNIQUE |
| Two admins cannot both approve | `SELECT … FOR UPDATE` on the application + status precondition in the same transaction |
| Amounts are never client-controlled | Disbursement amount read from `loan_applications.amount`; repayment amount is `min(client, outstanding)` computed under lock |
| `amount_paid` never exceeds `total` | `CHECK (amount_paid >= 0 AND amount_paid <= total)` |

---

## 4. Wallet model (C-07)

`wallets.balance` was **only ever a simulation artefact**: it was credited with loan principal at
approval and debited at "repayment". With real MoMo, the principal lands in the borrower's own
mobile-money account and repayments are collected from it — there is no custodial balance for
Kuula to hold.

**Decision: `wallets` is deprecated, not repaired.** No code path mutates it after this change.
It is retained (empty, with a non-negative CHECK constraint) purely so existing rows are not
destroyed and so any historical reconciliation can still read them. Kuula is not licensed to hold
customer funds; implementing a real custodial ledger here would be both out of scope and a
regulatory question, not an engineering one.

The authoritative record of money movement is the `transactions` ledger plus `repayments`.

See `KUULA_CRITICAL_REMEDIATION.md` §C-07 for the full mutation audit.

---

## 5. Provider authenticity (C-08)

MarzPay's strongest supported callback authentication is used, in this order:

1. **HMAC-SHA256 signature** over the raw request body, sent as `X-Marzpay-Signature`, with a
   `X-Marzpay-Timestamp` bound into the signed payload. Compared with `timingSafeEqual`.
   Timestamps outside ±5 minutes are rejected (replay window).
2. **Shared secret token** (`?token=` / `X-Webhook-Token`) — the mechanism the retired Supabase
   function used. Accepted only when `MARZPAY_WEBHOOK_MODE=token`, for providers/accounts where
   HMAC is not yet provisioned.

Both modes **fail closed**: with no secret configured the endpoint returns 503 and settles
nothing. Additionally, when `MARZPAY_VERIFY_CALLBACKS=true` (default in production) the server
independently re-queries MarzPay for the transaction status rather than trusting the callback's
`success` field. A raw `SUCCESS` in the body alone never settles money.

---

## 6. Configuration

New server environment variables (see `server/.env.example`):

```
MARZPAY_API_KEY, MARZPAY_API_SECRET, MARZPAY_BASE_URL
MARZPAY_WEBHOOK_SECRET, MARZPAY_WEBHOOK_MODE=hmac|token
MARZPAY_VERIFY_CALLBACKS=true
PUBLIC_API_BASE_URL           # where MarzPay POSTs callbacks
SMS_PROVIDER=africastalking|log
SMS_API_KEY, SMS_USERNAME, SMS_SENDER_ID
OTP_PEPPER
```

`server/src/lib/config.ts` validates these at boot and **refuses to start in production** if
payments or SMS are unconfigured, so a production deploy can never silently fall back to
simulation or console-logged OTPs.
