# Real-money activation, rollback and recovery

Kuula moves money through MarzPay only when `REAL_MONEY_ENABLED=true` on the
`kuula-api` Railway service. It was switched **off** in production on 2026-10-14 and
must stay off until every item in sections 1 and 2 is signed off by a named person.

Status markers: ☐ not done · ☑ done (record who and when).

## 1. Prerequisites outside the code

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1.1 | Lending licence / regulatory authority to lend to businesses in Uganda confirmed in writing (Tier 4 / UMRA as applicable). | Management, legal | ☐ |
| 1.2 | Loan agreement, pricing disclosure (APR, total repayable, no hidden fees) and the **interest-first repayment allocation** approved by legal. | Legal | ☐ |
| 1.3 | Underwriting policy values approved: 35% of haircut sales, 50% of net cash flow, 60% income haircut, UGX 500,000 first-loan cap and step, 7-day on-time grace, score tiers (`server/src/lib/underwriting.ts`, `UNDERWRITING_POLICY`). | Credit committee | ☐ |
| 1.4 | MarzPay business account verified; **sandbox mode switched off** only at go-live; subscribed to MTN/Airtel Uganda collection and disbursement; API disbursement permission enabled. | Finance | ☐ |
| 1.5 | Railway's outbound IP(s) whitelisted in MarzPay (needed for `send-money` and `GET /balance`). | Engineering | ☐ |
| 1.6 | MarzPay webhook **signing enabled**; its secret stored as `MARZPAY_WEBHOOK_SIGNATURE_SECRET`. In live mode every callback without a valid `X-MarzPay-Signature` is rejected. | Engineering | ☐ |
| 1.7 | MarzPay wallet funded with lending capital; capital injection recorded by finance (the ledger does not yet post capital injections; record them in the books manually). | Finance | ☐ |
| 1.8 | At least one `finance` staff account that is **not** a credit approver, with MFA phone verified. Payouts cannot be released without it. | Super admin | ☐ |
| 1.9 | Branch protection on `main`: pull request required, all CI checks required, no force pushes. | Repository owner | ☐ |
| 1.10 | Railway API token found in plain text in local scripts and in commit `9463453` (local branch `backup/pre-push-cleanup`) has been **rotated**. | Repository owner | ☐ |
| 1.11 | Production database backup restored successfully into an isolated database (section 5). | Engineering | ☐ |

## 2. Sandbox verification (MarzPay account in sandbox mode, real money still off in production)

Run these against a **non-production** deployment that uses the sandbox-mode MarzPay
account, `NODE_ENV=production`, `REAL_MONEY_ENABLED=true` and a public HTTPS
`PUBLIC_API_URL`. Record each result.

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| 2.1 | `GET /balance?country=UG` from the server | 200, `metadata.sandbox_mode: true` | ☐ |
| 2.2 | Loan approved → borrower accepts | Payout `awaiting_release`; no MarzPay call | ☐ |
| 2.3 | Release by the approving admin | 403 (segregation of duties) | ☐ |
| 2.4 | Release by the finance officer | `send-money` 201; leg `pending`; charge stored | ☐ |
| 2.5 | Signed `disbursement.completed` callback arrives | Loan `active`, repayment scheduled, journal posted | ☐ |
| 2.6 | Same callback replayed | 200 `duplicate`/`settled:false`; nothing posted twice | ☐ |
| 2.7 | Unsigned or wrongly signed callback | 401 | ☐ |
| 2.8 | Repayment of part of the balance | `collect-money`; pending until callback; receipt after | ☐ |
| 2.9 | Callback delayed: use **Check status with MarzPay** on the reconciliation screen | Settles from `GET /transactions` | ☐ |
| 2.10 | Failed collection | Balance unchanged; customer can retry | ☐ |
| 2.11 | Daily reconciliation for the test day | `matched`, zero exceptions | ☐ |
| 2.12 | Trial balance (`GET /api/admin/reconciliation/trial-balance`) | `balanced: true` | ☐ |

The CI job "Hardened financial lifecycle" (`server/scripts/financial-lifecycle.mjs`)
already proves these flows against a fake MarzPay that answers in the documented
shapes; section 2 confirms the real sandbox answers the same way. In particular, the
response shape of `GET /transactions?reference=` and its pagination keys are not
documented in detail, so 2.9 and 2.11 must be confirmed on real sandbox responses.

## 3. Go-live (requires written approval for each live transfer)

1. Confirm sections 1 and 2 are fully ticked.
2. Switch the MarzPay account out of sandbox mode.
3. In Railway, set `REAL_MONEY_ENABLED=true` on `kuula-api`. The service restarts;
   `GET https://api.kuulapp.com/api/health` must report `"realMoneyEnabled":true`.
4. **First live payout:** a small, explicitly approved amount to a known staff
   business account. Before releasing, the approver confirms in writing the exact
   amount, recipient name and phone number. Verify the money arrived, the loan
   activated and the daily reconciliation the next morning shows `matched`.
5. **First live repayment:** repay that loan in full; verify the receipt, the
   interest/principal journal and the trial balance.
6. Only then release customer payouts.

## 4. Turning real money off or rolling back

- **Stop all money movement immediately:** set `REAL_MONEY_ENABLED=false` on
  `kuula-api` in Railway. New payouts and collections stop. Callbacks and read-only
  status checks for transactions already in flight continue, so nothing is stranded.
- **Roll back a bad release:** in Railway → `kuula-api` → Deployments, redeploy the
  last good deployment, or revert the merge commit on `main` (Railway deploys `main`).
  Database migrations are additive (new columns, tables, checks and triggers), so the
  previous code runs against the newer schema.
- **Uncertain payouts:** never re-send. Use **Check status with MarzPay**. A failed leg
  can only be retried after MarzPay confirms the earlier attempt failed.

## 5. Backup and restore drill (do before go-live, then quarterly)

1. In Railway → Postgres → Backups, confirm automatic backups are enabled and note the
   latest backup time. If backups are not available on the plan, take a logical dump
   from a machine with access: `pg_dump --format=custom --no-owner "$DATABASE_URL" > kuula.dump`.
2. Restore into a **new, isolated** Postgres database (never the production one):
   `pg_restore --no-owner --dbname "$ISOLATED_DATABASE_URL" kuula.dump`.
3. Point a local API at the isolated database with `REAL_MONEY_ENABLED=false` and run
   `npx prisma migrate deploy` (it must report no pending migrations).
4. Compare row counts of `users`, `loan_applications`, `repayments`, `transactions`,
   `journals`, `journal_entries`, `audit_events` with production, and check that
   `GET /api/admin/reconciliation/trial-balance` reports `balanced: true`.
5. Delete the isolated database and the dump file. The dump contains personal and
   identity data: keep it encrypted and never on a shared or personal drive.
