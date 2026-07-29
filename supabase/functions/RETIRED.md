# RETIRED — do not deploy

These Edge Functions are **retired**. See `KUULA_PAYMENT_ARCHITECTURE.md` in the repo root.

The Node/Express backend in `server/` is the single authoritative backend for loan state,
disbursement, repayment, payment verification, webhooks and financial transactions. Running these
functions alongside it would give Kuula two systems writing the same money, which is the root
cause of finding **C-05** and makes the exactly-once guarantees in **C-06** and **C-08**
impossible to enforce.

## Where the logic went

| Retired function | Replacement |
|---|---|
| `_shared/marzpay.ts` | `server/src/lib/marzpay.ts` |
| `marzpay-disburse` | `server/src/lib/disbursement.ts` + `POST /api/loans/:id/accept` |
| `marzpay-collect` | `server/src/lib/repayment.ts` + `POST /api/loans/repayment/pay` |
| `marzpay-webhook` | `server/src/routes/webhooks.ts` → `POST /api/webhooks/marzpay` |
| `auto-collect` | `reconcilePendingCollections` / `markOverdueRepayments` in `server/src/lib/repayment.ts` |
| `credit-score` | `server/src/lib/credit-score.ts` (already in Node; unchanged) |

The Node implementations are strictly stronger than what is here: HMAC callback signatures with a
replay window, independent provider verification before settlement, `SELECT … FOR UPDATE` row
locking, unique idempotency keys, and partial unique indexes that make a second live disbursement
or a second in-flight collection impossible at the database level.

## Why the files are still here

They are kept read-only as a reference for one reconciliation cycle so the ported behaviour can be
diffed against the original. They are **not** deployed, and each `index.ts` short-circuits with
HTTP 410 unless `SUPABASE_FUNCTIONS_ENABLED=true`, which is never set anywhere.

Delete this directory once the Node payment path has run a full production cycle.
