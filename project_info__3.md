# Kuula — Production Readiness & Real-Money Status

**Investigation date:** 2026-08-05
**Question asked:** *Is the app ready for production? Is real money moving with MarzPay?*

---

## Direct Answers

| Question | Answer |
|---|---|
| **Is the app ready for production?** | **NO.** Not for real lending. The 8 critical financial/security findings from the launch audit were remediated in code, but the deployment is not configured to move money, and several known gaps remain (notably savings, KYC storage, live-provider verification). |
| **Is real money moving with MarzPay?** | **NO.** The MarzPay integration is **code-complete but not configured**. The server's runtime environment (`server/.env`) contains **no MarzPay credentials at all** — no `MARZPAY_API_KEY`, no `MARZPAY_API_SECRET`, no `MARZPAY_WEBHOOK_SECRET`, no `PUBLIC_API_BASE_URL`, no `SMS_PROVIDER`. Every disbursement/repayment attempt would return **HTTP 503**, and the webhook would fail closed with 503. No live MarzPay transaction has ever been run. |

---

## Evidence

### 1. The runtime config has no payment credentials

`server/.env` (the file the server actually loads):

```
DATABASE_URL=postgresql://postgres:...@localhost:5432/kuula_db
PORT=3000
JWT_SECRET=kuula-local-jwt-secret-change-in-production
```

That is the entire file. Compare with `server/.env.example`, which documents 10+ required payment/SMS variables. The root `.env` is equally bare.

The **only** MarzPay credentials anywhere in the repo live in `server/.env.test` — and those are deliberately fake stub values (`test-key` / `test-secret`) used to exercise the provider's HTTP boundary in tests. They are not real credentials and cannot move money.

### 2. The code is designed to fail closed (by design)

This is not an accident — the architecture was deliberately built so a misconfigured deploy cannot silently simulate payments:

- `server/src/lib/config.ts` → `paymentsConfigured()` returns `false` when `MARZPAY_API_KEY`/`MARZPAY_API_SECRET` are missing.
- `server/src/lib/disbursement.ts` → `requestDisbursement()` throws `AppError("Disbursements are temporarily unavailable...", 503)` when payments are not configured.
- `server/src/lib/repayment.ts` → `requestCollection()` throws `AppError("Payments are temporarily unavailable...", 503)`.
- `server/src/routes/webhooks.ts` → `verifyCallbackAuth()` returns 503 `webhook-not-configured` when no secret is set.
- `server/src/index.ts` → in production, `configErrors()` is fatal: the process **refuses to boot** without MarzPay credentials, a webhook secret, an `https://` `PUBLIC_API_BASE_URL`, a real SMS provider, and a 32+ char `OTP_PEPPER`.

With the current `server/.env` (no `NODE_ENV=production`), the server runs in development mode where these are warnings — and the effect is that both money endpoints 503 and OTPs are console-logged (SMS defaults to `log`).

### 3. The code path itself is complete and hardened — on paper

What the remediation delivered (all verified in source):

- **Two-phase disbursement** (`server/src/lib/disbursement.ts`): borrower accepts → row lock claims `offered → disbursing` → pending ledger row with unique `reference`/`idempotency_key` → MarzPay call outside the DB transaction → `settleDisbursement` from the verified webhook is the **only** writer of `status: "active"` and the repayment schedule.
- **Two-phase repayment** (`server/src/lib/repayment.ts`): `requestCollection` is a cap on a server-computed amount; `settleRepayment` is the sole writer of `amount_paid`, capped at outstanding, with overpayment flagged for refund.
- **Webhook security** (`server/src/routes/webhooks.ts`): HMAC-SHA256 over `<timestamp>.<rawBody>` with ±5 min replay window; unique `webhook_events.event_id` insert-before-process; independent outbound verification via `fetchTransactionStatus` when `MARZPAY_VERIFY_CALLBACKS=true`; amount/type cross-checks; `SELECT ... FOR UPDATE` compare-and-set for exactly-once settlement.
- **Database invariants** (migration `20260729120000_real_payments_and_secure_auth`): partial unique indexes `transactions_one_live_disbursement_per_loan`, `transactions_one_pending_collection_per_loan`, `loan_applications_one_live_loan_per_borrower`; CHECK constraints on `amount_paid <= total`, non-negative wallet/savings balances; unique `idempotency_key`/`provider_ref`/`reference`.
- **Regression guards** (`server/src/lib/no-simulated-money.test.ts`): source-level tests fail CI if any file outside `disbursement.ts` sets a loan `active`, or any route writes a completed money transaction, or anything mutates a wallet balance.
- **Test suite**: 92 backend tests (17 disbursement, 24 repayment, 15 webhook, 9 approval, 14 OTP, 7 sessions, plus guards) all pass against a real PostgreSQL — but **every provider interaction is stubbed at the HTTP boundary**.

### 4. The project's own audit confirms "NOT READY"

`KUULA_CRITICAL_REMEDIATION.md` (dated 2026-07-29) final status table:

```
CREDIT ENGINE ............. READY
REAL MONEY DISBURSEMENT ... NOT READY    code complete; needs live MarzPay sandbox verification
REAL MONEY COLLECTION ..... NOT READY    code complete; needs live MarzPay sandbox verification
FINANCIAL INTEGRITY ....... READY
AUTH ...................... READY        pending on-device verification of native keystore storage
BACKEND ................... READY
```

And the doc lists the **blocking steps before real money**:

1. Provision MarzPay credentials and run one sandbox disbursement and one sandbox collection.
2. Confirm the callback signing scheme with MarzPay and set `MARZPAY_WEBHOOK_MODE`; confirm the transaction-status endpoint used by `fetchTransactionStatus`.
3. Provision the SMS provider and verify one real OTP delivery.
4. Set `PUBLIC_API_BASE_URL` to a public https host reachable by MarzPay.
5. Apply migration `20260729120000` to staging (watch for existing multi-disbursement loans that would break the new partial unique indexes).
6. Run on physical iOS/Android devices to confirm keystore-backed session persistence (`pod install` was never run).

---

## Known Remaining Gaps (in addition to the MarzPay configuration)

| Gap | Severity | Status |
|---|---|---|
| **Savings deposit/withdraw move simulated balances** — `server/src/routes/savings.ts` increments/decrements `savings_accounts.balance` and writes a `completed` transaction with no payment provider. This is the **one remaining simulated-money path** in the app. | HIGH | Explicitly flagged in `KUULA_CRITICAL_REMEDIATION.md` §C-07 as out of scope and needing its own pass. |
| **MarzPay API shapes unverified** — request/response/signing assumed from the retired Supabase client; never confirmed against actual MarzPay docs or a live account. | BLOCKING | Callback header names and the `GET /transactions/{ref}` status endpoint must be confirmed. |
| **Webhook HMAC vs token mode** — default is `hmac`; if MarzPay only supports the legacy token mode, production refuses to boot (by design), and token mode is materially weaker. | BLOCKING | Needs provider confirmation. |
| **KYC images on local filesystem** (`KYC_STORAGE_DIR`) — no object storage, no encryption at rest, no authenticated admin retrieval path. | HIGH | TODO.md lists this as remaining work. |
| **No push notifications**; SMS only for OTPs — no SMS for approval/disbursement/due-date events. | HIGH | From original audit (H-01/H-02). |
| **`JWT_SECRET` is the literal default** `kuula-local-jwt-secret-change-in-production` in `server/.env` — a well-known string. | HIGH | Meets the 32-char length check but is trivially guessable in any deployed copy. |
| **`xlsx`/SheetJS npm audit findings** (1 low, 2 high) — bundled into the admin client for report export; no upstream fix. | MEDIUM | Pre-existing. |
| **No ESLint** — TypeScript `strict` is the only static gate. | LOW | Documented. |
| **`DEPLOYMENT.md` and `README.md` are stale/contradictory** — they describe the retired Supabase/Edge-Function architecture (`VITE_BACKEND=supabase`, Supabase project `yuqhwjvmamjwklumlhtt`, deploying Edge Functions). The code has moved to a single Node backend (C-05); the Edge Function deploy workflows are neutralised, and every function returns 410. Any engineer following those docs will deploy the wrong architecture. | MEDIUM | `KUULA_PAYMENT_ARCHITECTURE.md` is the correct reference. |
| **Credential/API surfaces for credit scoring are self-reported** — MoMo history and CRB status are manually set/seed values, not integrated with any data source. | MEDIUM | From original audit. |
| **No process on `unhandledRejection`** — Node process crash risk. | MEDIUM | From original audit (H-05). |

---

## How the Financial Flows Work Today (for the record)

### Disbursement (money out) — code-complete, disabled by config
1. Admin approves → `POST /api/loans/applications/decision` under `SELECT ... FOR UPDATE` → status `pending → offered`. **No money moves.**
2. Borrower accepts → `POST /api/loans/:id/accept` → `requestDisbursement()`:
   - claims `offered → disbursing`, sets `acceptedAt`, writes a `pending` ledger row (`reference: LOAN-<appId>`), all in one DB transaction;
   - calls `marzpay.disburse()` **outside** the transaction;
   - ambiguous outcomes (timeout/5xx) keep the row `pending` and the lock, flagged `needsReconciliation: true` — the retention is deliberate so the borrower cannot retry and be paid twice.
3. MarzPay webhook `POST /api/webhooks/marzpay` → HMAC verified → event id de-duplicated → matches the pending row → re-queries MarzPay → `settleDisbursement()` sets `status: "active"`, `disbursedAt`, and creates the repayment schedule. A 5-minute reconciliation sweep re-queries any stale pending transactions through the same path.

### Repayment (money in) — code-complete, disabled by config
1. `POST /api/loans/repayment/pay` → `requestCollection()`:
   - locks the repayment, computes `payable = total - amount_paid` server-side (client amount is only a cap),
   - rejects when a pending collection is already in flight for the loan,
   - writes a `pending` ledger row (`REPAY-<repaymentId>-<n>`),
   - calls `marzpay.collect()` → the borrower gets a mobile-money prompt. Response says `isPending: true`, never `success`.
2. Webhook/sweep → `settleRepayment()` allocates at most the outstanding balance, flags overpayments for refund, marks the loan `paid` at full repayment.

### The invariants that hold regardless of config
- A loan is disbursed at most once (partial unique index).
- At most one in-flight collection per loan (partial unique index).
- A callback settles at most once (`webhook_events.event_id` UNIQUE + compare-and-set on `pending`).
- `amount_paid` can never exceed `total` (CHECK constraint).
- Only `disbursement.ts` may set a loan `active`; only `repayment.ts` may write `amount_paid` (enforced by source-level CI tests).
- No code path mutates the deprecated `wallets.balance` (source-level CI test).

---

## What "Production Ready" Would Require (checklist)

- [ ] **Real MarzPay credentials** provisioned and placed in server env (`MARZPAY_API_KEY`, `MARZPAY_API_SECRET`, `MARZPAY_WEBHOOK_SECRET`).
- [ ] **One sandbox disbursement + one sandbox collection** completed against MarzPay, end to end (borrower accept → MoMo prompt → webhook settlement → loan `active`).
- [ ] **MarzPay API contract confirmed** — callback header names/signing scheme, `webhookMode` (`hmac` vs `token`), and the `GET /transactions/{ref}` status endpoint.
- [ ] **SMS provider provisioned** (Africa's Talking or MarzPay SMS) with `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_USERNAME`, `SMS_SENDER_ID`; one real OTP delivery verified.
- [ ] **`PUBLIC_API_BASE_URL`** set to a public `https://` host MarzPay can reach.
- [ ] **`OTP_PEPPER`** set to a strong 32+ char random value.
- [ ] **`JWT_SECRET`** replaced with a strong random value (the current literal default is not acceptable).
- [ ] **`NODE_ENV=production`** set — this activates the fatal boot-time config errors (a good thing).
- [ ] **Savings deposit/withdraw wired to a payment provider** or intentionally disabled — currently the only simulated-money path left.
- [ ] **Migration to staging** applied on a clean or cleaned database (existing simulated data may violate the new partial unique indexes).
- [ ] **KYC image storage** moved off local disk to object storage with an authenticated admin retrieval endpoint.
- [ ] **Physical device verification** of keystore-backed sessions (iOS Keychain / Android Keystore) — `pod install` was never run on this machine.
- [ ] **Sweep of stale docs** — `DEPLOYMENT.md` and `README.md` still describe the retired Supabase architecture.
- [ ] **XLSX dependency** replaced or isolated (upstream has no fix).
- [ ] **UMRA license** (referenced in DEPLOYMENT.md as required for Google Play's Personal Loan declaration) and store privacy notices.

---

## Bottom Line

The 2026-07-29 remediation **eliminated the simulated wallet money movement** — no line of code credits or debits a fake balance for loans anymore — and replaced it with a correct, concurrency-hardened, provider-backed two-phase payment architecture with excellent test coverage (92 tests against real PostgreSQL). That is a prerequisite met.

However, **no real money has ever moved through this system**. The server cannot currently reach MarzPay because no credentials are configured, the provider's actual API contract has never been validated against a live/sandbox account, and no sandbox transaction has been run in either direction. One money-related feature (savings) still simulates balances entirely. On top of that, production deployment prerequisites (SMS delivery, public HTTPS webhook endpoint, strong secrets, physical-device auth verification, KYC storage, updated deployment docs) remain undone.

**Verdict: NOT READY FOR PRODUCTION. Not moving real money. Code-complete but unconfigured and unproven against MarzPay.**
