# Kuula on Supabase

This directory adds a Supabase backend **alongside** the Node reference server in
`server/`. Nothing in the existing app is removed — the app chooses a backend at
build time via `VITE_BACKEND` (`node` default, or `supabase`).

```
supabase/
  migrations/0001_init.sql     tables + Row-Level Security + triggers
  functions/credit-score/      Edge Function: AI credit scoring (5 sources)
  functions/auto-collect/      Edge Function: auto-payment scheduler (cron)
  functions/_shared/core.ts    shared scoring / collection logic
  config.toml                  function config + hourly cron for auto-collect
```

## What each piece provides
| Feature | Where |
|---|---|
| Database | `migrations/0001_init.sql` — `profiles`, `messages`, `loan_applications`, `savings_accounts`, `wallets`, `repayments`, all under RLS |
| Authentication | Supabase Auth (phone+PIN for customers, email+password for admin); `profiles` row auto-created by the `on_auth_user_created` trigger |
| Loan service API | direct RLS-protected table access from `src/app/api/supabase-service.ts`; approval disburses + schedules repayment via the `on_loan_decision` trigger |
| Credit scoring | `functions/credit-score` (service-role read, JWT-authenticated, admins can score any user) |
| Auto-payment scheduler | `functions/auto-collect`, run hourly by `config.toml` cron — auto-debits due loans and writes receipts |

## One-time setup
1. **Keys** — in the app host (or `.env.local`):
   ```
   VITE_BACKEND=supabase
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...      # publishable, NOT the secret key
   ```
   Add the same two as GitHub **Actions secrets** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) so CI builds pick them up.

2. **Database**
   ```bash
   supabase link --project-ref YOUR_REF
   supabase db push
   ```

3. **Edge Functions** (the service key stays here, never in the app):
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   supabase functions deploy credit-score
   supabase functions deploy auto-collect
   ```

4. **Auth providers** — enable Phone (+ password) and Email in the Supabase
   dashboard. Seed an admin: create the user, then
   `update public.profiles set role='admin' where email='admin@kuula.ug';`

## Security
- The browser only ever holds the **publishable** key; RLS enforces access.
- The **`sb_secret_`** service key lives only in Edge Function secrets.
- APR (≤33.6%) and the 90-day minimum term are enforced in the schema
  (`loan_applications` CHECK constraints) as well as in app code.
