# Kuula — isolated credit approval release gate

This is an **execution checklist**, not evidence that the checks have passed. No GitHub Actions. Never use a production database, copy of live personal data without authorization, real MarzPay credentials, or a live payout.

## Environment precondition

Use an ephemeral **empty PostgreSQL** database with a name containing `test`, `isolated`, `sandbox` or `ci`. Provide a fake MarzPay API and separate test credentials. Apply all Prisma migrations on the empty database, then seed the existing dedicated test accounts using the project's existing test procedure.

Required safe flags:

- `NODE_ENV=test`
- `CREDIT_OPERATIONS_REQUIRED=true`
- `ISOLATED_APPROVAL_TEST=YES`
- `REAL_MONEY_ENABLED=false` in any production environment; use only fake MarzPay in an isolated test runtime

## Run (only in the isolated runtime)

```sh
cd server
npm ci --ignore-scripts
npx prisma generate
npx prisma migrate deploy
npm run build
node scripts/staged-credit-lifecycle.mjs
node scripts/audit-isolated-approvals.mjs
```

The staged-credit lifecycle script has existing setup prerequisites for the fake provider, staff admin, KYC and test customers. It is not safe to run against production, even with `NODE_ENV=test`; verify the database host and name and use only fake money endpoints. The audit script refuses non-test database names, but the older lifecycle script must also be restricted by the operator.

## Required approval matrix (record HTTP response and before/after DB row counts)

| Case | Expected outcome |
|---|---|
| Level 1 assigned loan officer evaluates, recommends amount and proposes pricing | Succeeds |
| Unassigned officer reads or changes sensitive case data | 403; no mutations |
| Officer is reassigned; previous assignee attempts an action | 403; no mutations |
| Level 1 tries to skip Level 2 or assign Level 3 directly | 409/422; no mutations |
| Level 1 submits incomplete evaluation/pricing | 409; no mutations |
| Level 2 recommends then assigns a distinct Level 3 approver | Succeeds |
| Level 2 tries to reuse the Level 1 officer as approver | 422; no mutations |
| Level 2 returns to Level 1 and officer resubmits | Succeeds; valid assignment and no duplicate active assignees |
| Level 1 or 2 attempts final approval | 403 |
| Level 3 tries submit rather than decision | 409; no approval action |
| Authorized Level 3 approves valid proposal | ready_for_offer; exactly one final action |
| Level 3 rejects valid case | rejected; no offer or payout |
| Authorized reviewer returns case to an allowed level | returned_for_clarification; one current assignment |
| One person tries to work different levels of the same case | 403 |
| Final approver attempts the finance release | 403 |
| Independent finance officer releases after customer accepts | Accepted by fake provider only |
| Duplicate signed/callback-like fake event | One settlement, one journal |
| Unauthorized finance/non-finance action | 403; no money movement |

## Pass standard

- All expected HTTP codes and postcondition assertions pass.
- No cross-level assignment, missing final approval, or duplicate active-assignment anomalies.
- Fake MarzPay confirms a single settlement with balanced ledger.
- The database is verified isolated before *any* test writes.
- No external SMS, email or real money is sent.
- Record the test database identifier (not its connection secret), commit, test timestamp, output, runner and any failure.

**Current state:** code and diagnostic are on `fix/approval-level-atomicity-20261119`; this checklist has **not** been executed. Railway fork execution is available only for an existing fork, and the Kuula project currently has no fork. Do not mark release gate passed yet.
