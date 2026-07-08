# Kuula on Supabase

This is the **production backend** for Kuula. The entire backend lives here:

```
supabase/
  migrations/                     SQL schema applied to your Supabase project
    0001_init.sql                  tables + RLS + triggers
    0002_transactions_and_loan_fields.sql
    0003_goals_and_notifications.sql
    0004_repayment_rpc.sql         server-authoritative money functions
    0005_loan_offer_acceptance.sql
  functions/
    marzpay-collect/               initiate mobile-money repayment
    marzpay-disburse/              disburse loan to borrower's MoMo
    marzpay-webhook/               MarZPay async callback receiver
    credit-score/                  credit decisioning (5-factor)
    auto-collect/                  hourly auto-payment sweep (cron)
    _shared/
      core.ts                      scoring + collection logic
      marzpay.ts                   MarZPay API client
      cors.ts                      origin-restricted CORS helper
  config.toml                      function config + cron schedule
```

## Architecture

```
Browser / Mobile App
        │
        ▼ (anon key + JWT)
   Supabase Postgres (RLS-protected)
        │
        ▼ (service role, server-side)
   Edge Functions (MarZPay, credit scoring, auto-collect)
```

- **Database** — 9 tables with Row-Level Security. Auth is Supabase Auth (phone + OTP for customers, email + password for admins).
- **Money movement** — All balance changes go through `SECURITY DEFINER` RPCs (`pay_repayment`, `topup_wallet`, `adjust_savings`) or Edge Functions. Clients can only READ their money rows.
- **Mobile money** — MarZPay aggregates MTN MoMo and Airtel Money. Real-money calls (collect, disburse, webhook) run in Edge Functions with the service role key.

## One-time setup

1. **Frontend env** — in `.env.local`:
   ```
   VITE_USE_API=true
   VITE_BACKEND=supabase
   VITE_SUPABASE_URL=https://yuqhwjvmamjwklumlhtt.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

2. **Database** — migrations are already applied. If starting fresh:
   ```bash
   supabase db push
   ```

3. **Edge Functions** — set secrets first, then deploy:
   ```bash
   supabase secrets set MARZPAY_API_KEY=...
   supabase secrets set MARZPAY_API_SECRET=...
   supabase secrets set MARZPAY_WEBHOOK_SECRET=...
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
   supabase secrets set CORS_ORIGIN=https://app.kuula.ug
   supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt
   ```

4. **Admin user** — create via Supabase Auth dashboard (email + password), then:
   ```sql
   update public.profiles set role='admin' where email='admin@kuula.ug';
   ```

## Security

- The browser only holds the **publishable** anon key; RLS enforces all access.
- The **service role key** lives only in Edge Function secrets — never in client code.
- The MarZPay webhook rejects all callbacks when `MARZPAY_WEBHOOK_SECRET` is missing (fail-closed).
- CORS is restricted to configured origins via the shared `cors.ts` helper.
- APR (≤33.6%) and the 90-day minimum term are enforced in CHECK constraints AND in app code.