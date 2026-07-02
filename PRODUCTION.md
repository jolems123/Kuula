# Kuula — Production Launch Checklist

## Current status (verified 2 Jul 2026)

| Check | Status |
|-------|--------|
| Database schema (9 tables, 4 RPCs) | ✅ Live in Supabase |
| `marzpay-collect` Edge Function | ✅ Deployed |
| `marzpay-disburse` Edge Function | ✅ Deployed |
| `marzpay-webhook` Edge Function | ✅ Deployed |
| `MARZPAY_WEBHOOK_SECRET` set in Supabase | ✅ Confirmed |
| Webhook secret matches Replit secret | ✅ Confirmed (200 {"received":true}) |
| `credit-score` Edge Function | ❌ Needs deploy |
| `auto-collect` Edge Function | ❌ Needs deploy |
| Credentials rotated | ⚠️ Pending |
| App deployed to production URL | ⚠️ Pending |

---

## Step 1 — Deploy missing Edge Functions

Two functions (`credit-score`, `auto-collect`) are in the repo but not yet live.

### Option A — GitHub Actions (recommended, automatic on every push)

1. Go to **https://github.com/jolems123/Kuula/settings/secrets/actions**
2. Add two secrets:
   - `SUPABASE_ACCESS_TOKEN` → your `sbp_xxxx` token from https://supabase.com/dashboard/account/tokens
   - Variable (not secret): `SUPABASE_PROJECT_REF` → `yuqhwjvmamjwklumlhtt`
3. Go to **Actions → Deploy Supabase Edge Functions → Run workflow**

After this, every push to `main` that touches `supabase/functions/` auto-deploys.

### Option B — Manual CLI (one-time)

```bash
# Get an sbp_ token from https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=sbp_xxxx
npx supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt
```

---

## Step 2 — Set MarzPay Edge Function secrets (if not already set)

In **Supabase Dashboard → Project → Edge Functions → Secrets**:

| Secret | Value |
|--------|-------|
| `MARZPAY_API_KEY` | Your MarzPay API key |
| `MARZPAY_API_SECRET` | Your MarzPay API secret |
| `MARZPAY_WEBHOOK_SECRET` | Same value as `MARZPAY_WEBHOOK_SECRET` in Replit |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API |

> **Note:** `MARZPAY_WEBHOOK_SECRET` is already confirmed working — only add it if you rotate it.

---

## Step 3 — Webhook URL (already handled automatically)

The webhook URL is passed **per transaction** as `callback_url`. No global dashboard
registration is needed. Each collect/disburse call sends:

```
https://yuqhwjvmamjwklumlhtt.supabase.co/functions/v1/marzpay-webhook?token=<SECRET>
```

MarzPay will POST the payment outcome to this URL automatically.

---

## Step 4 — Rotate exposed credentials

API keys were shared during setup. Rotate these before real-money transactions:

| Credential | Where to rotate | Where to update |
|------------|----------------|-----------------|
| `MARZPAY_API_KEY` | MarzPay dashboard | Replit Secrets + Supabase Edge Function Secrets |
| `MARZPAY_API_SECRET` | MarzPay dashboard | Replit Secrets + Supabase Edge Function Secrets |
| `MARZPAY_WEBHOOK_SECRET` | Generate new random string | Replit Secrets + Supabase Edge Function Secrets (update BOTH at the same time) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → Regenerate | Replit Secrets + Supabase Edge Function Secrets |

**Critical:** Update `MARZPAY_WEBHOOK_SECRET` in Replit AND Supabase Edge Function secrets simultaneously — if they get out of sync, all webhook callbacks are rejected.

---

## Step 5 — Deploy the app

Click **Publish** in Replit to get a stable `*.replit.app` URL, or configure a custom domain.

Update `VITE_SUPABASE_URL` and callback URLs if you change hosting.

---

## Step 6 — End-to-end payment test

Run the verification script first:
```bash
node scripts/verify-prod.mjs
```

Then do a live test:
1. Register a new account in the app
2. Apply for a loan (smallest amount, e.g. UGX 50,000)
3. Admin logs in → approves the loan
4. Customer sees "offered" status → taps Accept
5. Confirm the MoMo prompt appears on the test phone
6. MarzPay POSTs to the webhook → loan status → "approved"
7. Customer makes a repayment → confirm webhook settles it → loan → "paid"

---

## Verify production status anytime

```bash
node scripts/verify-prod.mjs
```

Expected output when fully ready:
```
✅ 18 checks passed
🚀 All checks passed. App is production-ready.
```
