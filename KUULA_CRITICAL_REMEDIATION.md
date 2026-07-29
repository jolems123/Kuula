# Kuula — Critical Production Remediation

**Date:** 2026-07-29
**Scope:** The 8 CRITICAL findings from `KUULA_LAUNCH_AUDIT.md` (`project_info__1.md`). No HIGH or
MEDIUM findings were addressed. No credit scoring, pricing, fees or eligibility rules were changed.

**Verification method:** every finding below was re-investigated against the current source after
the changes, not by editing the previous audit's status lines. Each `PASS` is backed by tests that
run against a real PostgreSQL database — the guarantees at stake are row locks, partial unique
indexes and CHECK constraints, which do not exist in a mock.

---

## Verification results

```
Frontend typecheck (tsc --noEmit) ............ PASS
Frontend unit tests .......................... PASS   47 tests, 6 files
Frontend production build (vite) ............. PASS   built in 31.7s
Backend typecheck (tsc --noEmit) ............. PASS
Backend production build (tsc) ............... PASS   no test files emitted
Backend test suite (real PostgreSQL) ......... PASS   92 tests, 6 files
Prisma migrations (fresh database) ........... PASS   4/4 applied
Capacitor sync (android + ios) ............... PASS   secure-storage plugin registered on both
Pricing compliance (UMRA 33.6% / Apple 36%) .. PASS   150 combinations, unchanged
Env validation (scripts/check-env.mjs) ....... PASS
npm audit — server ........................... PASS   0 vulnerabilities
npm audit — root ............................. 3 findings in `xlsx`, pre-existing (see Risks)
```

Lint: the project has no ESLint configuration; TypeScript `strict` typechecking is the standing
static gate and it passes on both packages.

---

## C-01 — REAL DISBURSEMENT

**Root cause.** Loan disbursement was never wired to a payment provider. Accepting an offer, and
separately approving an application, each incremented a `wallets.balance` column and wrote a
`transactions` row with `status: "completed"`. The provider integration existed only in the
disabled Supabase Edge Functions.

**Old behaviour.** `POST /api/loans/:id/accept` set the application to `active`, credited
`wallet.balance += principal`, wrote a completed `loan_disbursement` transaction, and told the
borrower "your loan has been disbursed to your wallet" — in one transaction, with no external
call. `POST /api/admin/loans/:id/approve` did the same thing again at approval time.

**New behaviour.** Two phases with a hard separation between *requesting* money and *having moved*
money.

1. `requestDisbursement` (`server/src/lib/disbursement.ts`) takes a `SELECT … FOR UPDATE NOWAIT`
   lock on the application, validates that the borrower owns it and that the status is `offered`,
   validates the recipient is a real Ugandan mobile number, reads the principal **from the
   database** (the client cannot supply or influence an amount), claims the payout slot
   (`offered → disbursing`, `accepted_at NULL → now()`), writes a `pending` ledger row with a
   unique `reference` and `idempotency_key`, and only then calls MarzPay — outside the database
   transaction, because a rollback cannot un-send a payout.
2. `settleDisbursement`, reachable only from the verified webhook and the reconciliation sweep,
   is the sole writer of `status: "active"` and `disbursed_at`, and the only place the repayment
   schedule is created.

Ambiguous provider outcomes (timeout, 5xx) leave the row `pending` and **keep** the lock, flagged
for reconciliation. Releasing it would let the borrower retry and be paid twice.

**Files changed.**
`server/src/lib/disbursement.ts` (new), `server/src/lib/marzpay.ts` (new),
`server/src/lib/db-lock.ts` (new), `server/src/lib/audit.ts` (new),
`server/src/routes/loans.ts`, `server/src/routes/admin.ts`, `server/src/index.ts`,
`src/app/api/client.ts`, `src/app/components/screens/LoanAgreementScreen.tsx`.

**Schema changes.** `transactions`: `provider`, `provider_ref` (unique), `reference` (unique),
`idempotency_key` (unique), `repayment_id`, `failure_reason`, `settled_at`, `updated_at`.
`loan_applications`: `disbursed_at`, `disbursement_txn_id`. Partial unique index
`transactions_one_live_disbursement_per_loan`. CHECK constraints on transaction amount/status and
on `loan_applications.amount > 0 AND total >= amount`.

**Tests.** `server/src/lib/disbursement.test.ts` (17) — provider actually called; loan stays
`disbursing` and `disbursed_at` stays null until settlement; server-side amount is what is sent;
no wallet row is ever created; invalid recipient rejected without stranding the offer; another
borrower's loan cannot be disbursed; definitive rejection releases the offer; timeout holds the
lock and flags reconciliation; settlement books the loan and schedules repayment exactly once.
Plus `server/src/lib/no-simulated-money.test.ts` — a source-level guard asserting that no file
outside `lib/disbursement.ts` sets a loan `active`, and no route writes a completed money
transaction.

**Status: PASS**

**Remaining risk.** Not yet exercised against a live MarzPay account. The provider is stubbed at
its HTTP boundary, so the request/response *shapes* are assumed from the retired Supabase client
rather than confirmed. A sandbox transaction must be run before real funds move, and
`fetchTransactionStatus` assumes a `GET /transactions/{ref}` endpoint that needs confirming
against MarzPay's current API.

---

## C-02 — REAL REPAYMENT

**Root cause.** Repayment deducted from the same simulated wallet balance. No collection was ever
requested from the borrower's mobile money.

**Old behaviour.** `POST /api/loans/repayment/pay` read `wallet.balance`, refused if it was too
low ("insufficient-wallet-balance"), then decremented the wallet, incremented
`repayments.amount_paid`, marked the loan `paid` if it reached the total, wrote a `completed`
transaction, and returned `attempt.success: true` — entirely from a single client request.

**New behaviour.** `requestCollection` (`server/src/lib/repayment.ts`) locks the repayment,
computes the payable amount server-side (`total - amount_paid`), treats any client-supplied amount
strictly as a **cap** that can only reduce it, refuses when a collection is already in flight for
that loan, writes a `pending` ledger row, and sends a MarzPay request-to-pay. The balance is
untouched. `settleRepayment` — reachable only from the verified webhook and reconciliation — is
the sole writer of `amount_paid`, allocating at most the outstanding balance and recording any
excess on the transaction as an overpayment for refund.

The response now reports `isPending` rather than `success`, because at that point nothing has been
collected.

**Files changed.**
`server/src/lib/repayment.ts` (new), `server/src/routes/loans.ts`, `server/src/index.ts`,
`src/app/api/client.ts`.

**Schema changes.** `repayments` CHECK `amount_paid >= 0 AND amount_paid <= total`; CHECK
`total > 0`; index on `loan_id`. Partial unique index
`transactions_one_pending_collection_per_loan`.

**Tests.** `server/src/lib/repayment.test.ts` (24) — covers partial, full, failed, pending,
duplicate request, duplicate callback, concurrent callbacks, overpayment, repayment after
completion, provider timeout, wrong amount, and borrower isolation. Two partials summing to
completion are asserted explicitly. The database-level invariants (`amount_paid` cannot exceed
`total`, cannot go negative) are tested by attempting the write directly and expecting rejection.

**Status: PASS**

**Remaining risk.** Same live-provider caveat as C-01. Overpayments are detected, capped and
flagged in the audit trail but there is no automated refund path — reconciliation is manual.

---

## C-03 — SECURE TOKEN STORAGE

**Root cause.** The server issued a single 24-hour JWT, and the web client wrote it to
`localStorage` under `kuula_session_token`. `KycScreen` additionally probed four more
`localStorage`/`sessionStorage` keys. Nothing was revocable.

**Old behaviour.** Any XSS could read a 24-hour credential. Logging out only dropped React state;
the token stayed valid. `signOut()` was `async () => {}`.

**New behaviour.** Authority is split.

- **Access token** — JWT, 15 minutes, held in a module variable in `src/app/lib/session.ts` and
  written nowhere else. It dies with the tab.
- **Refresh token** — opaque 256-bit random string, stored **hashed** (SHA-256) in
  `refresh_tokens`, rotated on every use, revocable individually or per user.

Transport differs by platform because the right answer differs. **Web**: httpOnly, Secure,
SameSite=Lax cookie scoped to `/api/auth` — unreadable by script, so the client stores nothing.
**Native (Capacitor)**: the refresh token is returned in the body and written to the iOS Keychain /
Android Keystore via `capacitor-secure-storage-plugin`; if that plugin is unavailable the client
**refuses to persist** rather than silently downgrading to web storage.

Rotation gives stolen-token detection: refresh tokens are single-use, so a token presented twice
revokes the entire rotation family. Legacy `localStorage` keys are purged on first run of the new
code.

Existing screens did not need to change: they still pass the token they were given at login, and
`request()` in `src/app/api/client.ts` swaps it for a current one, refreshing transparently.

**Files changed.**
`server/src/lib/sessions.ts` (new), `server/src/lib/config.ts` (new),
`server/src/routes/auth.ts`, `server/src/index.ts`,
`src/app/lib/session.ts` (new), `src/app/lib/secure-store.ts` (new),
`src/app/App.tsx`, `src/app/api/client.ts`, `src/app/context/AppContext.tsx`,
`src/app/components/screens/KycScreen.tsx`. Added `cookie-parser`,
`capacitor-secure-storage-plugin@0.12.0`.

**Schema changes.** New `refresh_tokens` table (hashed token, family id, device label, expiry,
revocation, replacement chain).

**Tests.** `src/app/lib/session.test.ts` (12) — asserts the access token is not in
`localStorage`/`sessionStorage` after login, that the refresh token never reaches web storage, that
legacy keys are purged, that restoration goes through `/api/auth/refresh` with
`credentials: "include"`, that concurrent callers share one in-flight refresh (rotating three times
would trip reuse detection), and that logout revokes server-side and clears locally even offline.
`server/src/lib/otp.test.ts` sessions block (7) — hashed storage, rotation, family revocation on
replay, logout, expiry, multi-device independence, concurrent refresh.

**Status: PASS**

**Remaining risk.** The native secure-storage path is verified by `cap sync` registering the plugin
on both platforms and by unit tests of the adapter's contract; it has not been executed on a
physical device or simulator (no Xcode/CocoaPods on this machine — `pod install` was skipped).
Run the app on a real iOS and Android device before release. The access token remains a bearer JWT
with no per-request binding, so a 15-minute window still exists if one is captured in transit.

---

## C-04 — REAL OTP

**Root cause.** No SMS provider was ever integrated. OTPs were generated, stored in plaintext on
`users.otp_code`, and printed with `console.log("[DEV] OTP for …")`.

**Old behaviour.** Users could not receive codes. Codes lived in plaintext in the database for 10
minutes with no attempt limit, no resend cooldown, and no rate limit. `resend-otp` returned
`404 "Phone not found"` for unknown numbers, making it an account-enumeration oracle.

**New behaviour.** `server/src/lib/sms.ts` provides a real driver (Africa's Talking, the standard
Uganda aggregator) behind a thin interface, plus a `log` driver for development that production
**refuses to boot with**. `server/src/lib/otp.ts` enforces the full set:

- generated with `crypto.randomInt`, stored as `HMAC-SHA256(code, OTP_PEPPER)` — never plaintext
- 5-minute expiry; 60-second resend cooldown; 5 requests/phone/hour; 5 verification attempts
- a resend invalidates every outstanding challenge, so an older SMS stops working immediately
- a verified challenge is consumed — replay returns `no-challenge`
- constant-time comparison; attempts counted even on wrong codes
- codes never logged in production and never returned outside development
- signup, resend and reset-password all return one generic message regardless of whether the
  account exists

IP rate limits were added on the OTP endpoints on top of the per-phone limits. The plaintext
`users.otp_code` / `otp_expires_at` columns are marked deprecated, purged by the migration, and a
source-level test asserts nothing writes them.

**Files changed.**
`server/src/lib/otp.ts` (new), `server/src/lib/sms.ts` (new), `server/src/lib/config.ts` (new),
`server/src/routes/auth.ts`, `server/src/index.ts`, `server/.env.example`.

**Schema changes.** New `otp_challenges` table (hashed code, purpose, expiry, attempts,
consumed/invalidated timestamps, delivery state).

**Tests.** `server/src/lib/otp.test.ts` (14 OTP cases) — delivery via SMS rather than a log line;
the stored hash does not contain the code; deprecated columns stay null; short expiry; cooldown;
hourly cap; resend invalidates the old code; correct code accepted exactly once; replay rejected;
wrong code; expired code; attempt lockout that persists even when the correct code follows;
malformed input does not burn an attempt; a code cannot be used for a different purpose or phone.

**Status: PASS**

**Remaining risk.** The Africa's Talking driver is written to their documented API but has not been
exercised against a live account — credentials must be provisioned and one real send verified in
sandbox before launch. No SMS provider was pre-approved in the repository, so this choice should be
confirmed commercially. Delivery failures invalidate the challenge and surface a generic error; there
is no fallback provider.

---

## C-05 — SINGLE BACKEND ARCHITECTURE

**Root cause.** Two backends existed. The Node/Express service owned auth, users, loans and KYC and
was the only one the app could reach; the Supabase Edge Functions owned the real MarzPay
integration and were unreachable (`isSupabaseConfigured = false`). The working payment code lived
in the backend nothing called.

**Old behaviour.** Ambiguous ownership of loan state, and — critically — three GitHub Actions
workflows that redeployed the Supabase payment functions on **every push touching
`supabase/functions/**`**. This very change set touches those paths, so without intervention it
would have stood the second financial backend back up.

**New behaviour.** Documented and enforced in `KUULA_PAYMENT_ARCHITECTURE.md`: the Node backend is
the single authority for loan state, disbursement, repayment, payment verification, webhooks and
financial transactions. Every capability that existed only in Supabase was ported to Node (the
mapping is tabulated in that document and in `supabase/functions/RETIRED.md`).

Enforcement is layered so this cannot regress by accident:
- all three deploy workflows are neutralised — push triggers removed, and a manual run fails with
  an explanation
- every Edge Function short-circuits with HTTP 410 unless `SUPABASE_FUNCTIONS_ENABLED=true`, which
  is set nowhere
- `src/app/lib/supabase.ts` was **deleted** (nothing imported it any more) and the `supabase`
  manual chunk was removed from `vite.config.ts`, so the shipped bundle no longer contains a
  Supabase client at all

**Files changed.**
`KUULA_PAYMENT_ARCHITECTURE.md` (new), `supabase/functions/RETIRED.md` (new),
all five `supabase/functions/*/index.ts`, `.github/workflows/deploy-edge-functions.yml`,
`deploy-functions.yml`, `deploy-supabase-fns.yml`, `.github/workflows/ci.yml`,
`vite.config.ts`, `src/app/lib/supabase.ts` (deleted), `src/app/context/AppContext.tsx`.

**Schema changes.** None.

**Tests.** Verified by re-inspection: no source file under `src/` imports a Supabase client, and
the production build no longer emits a Supabase chunk. The CI backend job — which previously
pointed at a nonexistent `backend/` directory and a nonexistent `server/server.mjs`, so it had been
silently failing to test anything — now runs the real suite against a PostgreSQL service container.

**Status: PASS**

**Remaining risk.** The `@supabase/supabase-js` dependency is still in `package.json` (unused, and
no longer bundled). The Supabase migration files and function sources remain in the tree as a
reference for one reconciliation cycle; `RETIRED.md` says to delete them afterwards. If the
Supabase project itself still exists, its service-role keys should be rotated or the project
deleted.

---

## C-06 — APPROVAL IDEMPOTENCY

**Root cause.** Both approval endpoints did a bare `findUnique` followed by an `update`, with no
lock and no transaction. Two concurrent requests both read `pending`, both proceeded, and both
performed the (then simulated) financial effect.

**Old behaviour.** Two admins approving simultaneously produced two wallet credits, two repayment
schedules and two disbursement transactions. A double-clicked button did the same. Nothing but
frontend button state prevented it.

**New behaviour.** Every state transition that can precede money now runs inside one transaction
behind `SELECT … FOR UPDATE NOWAIT` with a status precondition re-checked under the lock:

- `POST /api/admin/loans/:id/approve` and `/reject` — approval now produces an **offer** only, and
  moves no money at all
- `POST /api/loans/applications/decision` — same treatment
- `POST /api/loans/:id/accept` — claims the payout slot as described in C-01

Below that, the database enforces the invariant independently of application logic:
`transactions.idempotency_key` is UNIQUE (a client retry, a double-click and a second server
instance collapse onto one row), and
`transactions_one_live_disbursement_per_loan` makes a second pending-or-completed payout for a loan
impossible to insert at all.

**Files changed.** `server/src/routes/admin.ts`, `server/src/routes/loans.ts`,
`server/src/lib/db-lock.ts` (new), `server/src/lib/disbursement.ts` (new).

**Schema changes.** Unique index on `transactions.idempotency_key`; partial unique indexes
`transactions_one_live_disbursement_per_loan` and
`loan_applications_one_live_loan_per_borrower`.

**Tests.** `server/src/routes/approval.test.ts` (9) — every scenario the brief listed: two admins
approving simultaneously; one admin double-clicking (5 concurrent); a client retry after success;
**two independently mounted server instances** sharing one database (which is what a load-balanced
deployment looks like to Postgres); approve racing reject; a non-admin attempting approval.
Each asserts exactly one 200 and exactly one borrower notification.
`server/src/lib/disbursement.test.ts` covers acceptance-side idempotency: double-click, 5-way
concurrent acceptance, same-key retry, already-disbursed loan, and a forged direct insert that the
constraint rejects.

**Status: PASS**

**Remaining risk.** `FOR UPDATE NOWAIT` fails fast under contention and surfaces as a 409, which is
correct but means a legitimate retry-under-load also sees 409. Acceptable for approvals; worth
watching if approval volume grows.

---

## C-07 — WALLET / BALANCE INTEGRITY

**Investigation first, as instructed.** Every mutation of `wallet_balance` was traced before any
schema change:

| Site | What it represented |
|---|---|
| `loans.ts` accept — `increment: principal` | simulated loan proceeds |
| `admin.ts` approve — `increment: principal` | simulated loan proceeds (a second time) |
| `loans.ts` repayment/pay — `decrement: payAmount` | simulated repayment funding |
| `auth.ts` signup, `seed.ts` — `create: { balance }` | initial simulated float |
| `index.ts` `/api/wallet/topup` | already disabled, returned 400 |

**Conclusion: `wallets` was purely a simulation artefact.** It never held real stored value, no
frontend screen read it, and no ledger backed it. With real MarzPay flows the principal lands in
the borrower's own mobile-money account and repayments are collected from it — Kuula holds no
customer funds and has no licence to. Building a custodial ledger to "fix" a fake balance would
have preserved the wrong model.

**Old behaviour.** The balance could go negative: nothing constrained it, and the repayment path
decremented after only an application-level check.

**New behaviour.** The wallet is **deprecated, not repaired**. No code path mutates it — the
`Wallet` model carries a deprecation note explaining why, and `no-simulated-money.test.ts` fails CI
if any file reintroduces a write. The table is retained (non-destructive) with a `balance >= 0`
CHECK as defence-in-depth so a future regression cannot recreate a negative simulated balance.
`/api/wallet/topup` now returns 410 with an explanation. The authoritative record of money movement
is the `transactions` ledger plus `repayments`.

The same non-negative constraint was added to `savings_accounts`, which **is** a real customer
liability.

**Files changed.** `server/prisma/schema.prisma`, `server/src/routes/loans.ts`,
`server/src/routes/admin.ts`, `server/src/routes/auth.ts`, `server/src/index.ts`.

**Schema changes.** `wallets` CHECK `balance >= 0` (with a one-time `UPDATE … SET balance = 0 WHERE
balance < 0` so the constraint can be applied to existing rows without deleting anything);
`savings_accounts` CHECK `balance >= 0`. No table or column was dropped.

**Tests.** `server/src/lib/repayment.test.ts` financial-invariants block — the database rejects a
negative wallet balance and a negative savings balance.
`server/src/lib/no-simulated-money.test.ts` — no source file calls
`wallet.update/upsert/create/delete`. `disbursement.test.ts` and `repayment.test.ts` assert no
wallet row is created by a full disburse-and-settle or collect cycle.

**Status: PASS**

**Remaining risk.** Existing production `wallets` rows hold non-zero simulated balances that no
longer mean anything. They are preserved deliberately, but a decision is needed on whether to zero
them and drop the table after one reconciliation cycle. The savings deposit/withdraw endpoints were
not in scope for this remediation and still move `savings_accounts.balance` without a payment
provider — that is a HIGH-severity gap outside these 8 findings and needs its own pass.

---

## C-08 — WEBHOOK SECURITY

**Root cause.** The Node backend had no callback endpoint at all. The only webhook receiver lived
in the disabled Supabase function, and it authenticated with a shared secret in a query parameter
and trusted the callback body's success field.

**Old behaviour.** No way for a real payment outcome to reach the authoritative backend.

**New behaviour.** `POST /api/webhooks/marzpay` (`server/src/routes/webhooks.ts`) is the only place
in Kuula where a loan becomes disbursed or a balance is reduced. It defends in six layers:

1. **Authenticity** — HMAC-SHA256 over `<timestamp>.<raw body>`, constant-time compared, with a
   ±5-minute timestamp window so a captured callback cannot be replayed later. The raw bytes are
   preserved by a dedicated body parser, since re-serialising would break the signature. Fails
   **closed**: with no secret configured it returns 503 and settles nothing. A legacy shared-token
   mode exists for accounts where HMAC is not yet provisioned, and production refuses to boot in
   that mode.
2. **Replay/duplicate** — `webhook_events.event_id` is UNIQUE and inserted *before* processing, so
   concurrent duplicates serialise and only one proceeds. A previous delivery that errored
   mid-processing can still be retried; exactly-once is guaranteed below, not here.
3. **Matching** — the callback must resolve to an existing **pending** internal transaction, by our
   reference or the provider's id. Unknown references settle nothing.
4. **Independent verification** — when `MARZPAY_VERIFY_CALLBACKS=true` (default) the server
   re-queries MarzPay over an authenticated outbound request and uses *that* answer. A raw
   `SUCCESS` in the request body never settles money on its own. If verification is unavailable it
   returns 503 and asks for a retry rather than guessing.
5. **Amount and type** — the provider's amount must match the pending row, and the callback's kind
   must match the ledger row's type. A callback whose own signals contradict each other (event type
   says collection, reference says disbursement) is rejected outright.
6. **Exactly-once** — settlement is a compare-and-set off `pending` inside a `SELECT … FOR UPDATE`
   transaction, in `settleDisbursement` / `settleRepayment`.

A reconciliation sweep every 5 minutes resolves transactions whose callback never arrived, through
the same exactly-once path.

**Files changed.** `server/src/routes/webhooks.ts` (new), `server/src/lib/marzpay.ts` (new),
`server/src/index.ts`.

**Schema changes.** New `webhook_events` table (unique `event_id`, payload hash, status, result).
New `audit_events` table.

**Tests.** `server/src/routes/webhooks.test.ts` (15), driven over real HTTP against the real
Express route — unsigned callback rejected; forged signature rejected; stale timestamp rejected;
an unsigned callback carrying a *genuine* reference settles nothing; unknown reference ignored;
malformed callback rejected; type-mismatch rejected; wrong amount rejected; successful
disbursement and repayment settle correctly; redelivered identical callback is a no-op; a
*distinct* late callback for an already-settled transaction is also a no-op; six concurrent
callbacks apply the payment exactly once; a failure callback produces no financial effect; an
indeterminate event is ignored.

**One real defect was found and fixed by these tests**: a callback whose `eventType` said
`collection.success` while its reference was `LOAN-…` was accepted, because the reference prefix
was checked first. `parseCallback` now reads each signal independently and rejects contradictions.

**Status: PASS**

**Remaining risk.** MarzPay's actual signature header names, signing scheme and status endpoint
have not been confirmed against live documentation — the implementation supports the strongest
common pattern (HMAC over timestamp + body) plus the legacy token mode the retired function used,
but **this must be verified with MarzPay before go-live**, and `MARZPAY_WEBHOOK_MODE` set
accordingly. If MarzPay does not offer HMAC, the token mode is materially weaker and the
independent verification in layer 4 becomes load-bearing rather than defence-in-depth.

---

## Final status

```
C-01 REAL DISBURSEMENT ............ PASS
C-02 REAL REPAYMENT ............... PASS
C-03 SECURE TOKEN STORAGE ......... PASS
C-04 REAL OTP ..................... PASS
C-05 SINGLE BACKEND ARCHITECTURE .. PASS
C-06 APPROVAL IDEMPOTENCY ......... PASS
C-07 WALLET/BALANCE INTEGRITY ..... PASS
C-08 WEBHOOK SECURITY ............. PASS
```

```
CREDIT ENGINE ............. READY        (unchanged, as instructed)
REAL MONEY DISBURSEMENT ... NOT READY    code complete; needs live MarzPay sandbox verification
REAL MONEY COLLECTION ..... NOT READY    code complete; needs live MarzPay sandbox verification
FINANCIAL INTEGRITY ....... READY
AUTH ...................... READY        pending on-device verification of native keystore storage
BACKEND ................... READY
```

### Why disbursement and collection are NOT READY despite C-01/C-02 passing

The findings are remediated: the simulated money movement is gone, the flows are provider-backed
end to end, and the financial guarantees hold under concurrency against a real database. But
"remediated" is not "proven to move money". Every provider interaction in these tests is stubbed at
the HTTP boundary, which is the correct place to stub for correctness testing and the wrong thing
to rely on as evidence that real funds arrive. Per the brief's own instruction — simulated
movements are not proof that payments work — these cannot be called READY until a MarzPay sandbox
transaction has completed in both directions.

**Blocking steps before real money:**

1. Provision MarzPay credentials and run one sandbox disbursement and one sandbox collection.
2. Confirm the callback signing scheme with MarzPay and set `MARZPAY_WEBHOOK_MODE`; confirm the
   transaction-status endpoint used by `fetchTransactionStatus`.
3. Provision the SMS provider and verify one real OTP delivery.
4. Set `PUBLIC_API_BASE_URL` to a public https host and confirm MarzPay can reach the webhook.
5. Apply `20260729120000_real_payments_and_secure_auth` to staging. **On a database with existing
   simulated data the new partial unique indexes may fail** if any loan already has multiple
   completed disbursement rows, or any borrower has multiple live loans — check and clean first.
   The migration itself is additive and drops nothing.
6. Run the app on a physical iOS and Android device to confirm keystore-backed session persistence
   (`pod install` could not run here — no CocoaPods on this machine).

### Other outstanding risks

- `npm audit` reports 3 findings (1 low, 2 high) in `xlsx`/SheetJS, used for admin report export.
  Pre-existing, unrelated to this remediation, and no fix is available upstream. It is bundled into
  the client, so it processes untrusted spreadsheet input only if a user opens one — worth
  scheduling a replacement.
- Savings deposit and withdrawal still move balances without a payment provider. Out of scope for
  these 8 findings; needs the same treatment before savings can be called real.
- There is no ESLint configuration in the project; static analysis is TypeScript `strict` only.

---

**STOP.** No HIGH or MEDIUM findings and no app-store polish were addressed. Awaiting approval
before proceeding.
