# Kuula — Deployment Guide (Supabase + Capacitor + App Stores)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  GitHub (source code)                                    │
│  └─ .github/workflows/                                  │
│     ├─ deploy-supabase-fns.yml  → auto-deploys Edge Fns │
│     └─ build-mobile.yml         → CI + signed APK/IPA   │
└──────────┬──────────────────────────┬────────────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌──────────────────────┐
│  Supabase (hosted)  │    │  Capacitor (local/CI) │
│  ├─ Postgres DB     │    │  ├─ Android AAB ──────► Google Play  │
│  ├─ Auth (JWT+SMS)  │    │  └─ iOS IPA ─────────► App Store     │
│  └─ 5 Edge Functions│    └──────────────────────┘
└─────────────────────┘
```

- **Supabase** = database + auth + API (they host everything)
- **Capacitor** = wraps your web build into native Android/iOS apps
- **Google Play / App Store** = app distribution (they host the download)

> **Note:** This project uses **Capacitor** (not Expo/EAS). The web app builds with
> Vite, then `cap sync` copies the `dist/` output into the native Android/iOS
> projects. You build the native apps either locally (Android Studio / Xcode)
> or in GitHub Actions (see `build-mobile.yml`).

---

## 1. Prerequisites

| What | Details |
|------|---------|
| Supabase project | Already set up at `yuqhwjvmamjwklumlhtt.supabase.co` |
| Node.js 20+ | Build machine only |
| Android Studio | For local Android builds |
| Xcode (Mac only) | For local iOS builds |
| Google Play Console | $25 one-time, for Android distribution |
| Apple Developer account | $99/year, Organization account (not Individual) |
| UMRA money-lender license | Required for Google Play Personal Loan declaration |

---

## 2. Clone & Install

```bash
git clone https://github.com/jolems123/Kuula.git
cd Kuula
npm ci --legacy-peer-deps
```

---

## 3. Create Your Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_BACKEND=supabase
VITE_USE_API=true
VITE_SUPABASE_URL=https://yuqhwjvmamjwklumlhtt.supabase.co
VITE_SUPABASE_ANON_KEY=<your sb_publishable_... key from Supabase Dashboard → Settings → API>
VITE_APP_ENV=production
VITE_APP_VERSION=2.4.1
VITE_ENABLE_BIOMETRIC=true
VITE_ENABLE_SAVINGS=true
VITE_REVIEWER_MODE=false
```

> **Never** put `SUPABASE_SERVICE_ROLE_KEY`, `MARZPAY_API_KEY`, or
> `MARZPAY_WEBHOOK_SECRET` here — those are server-side secrets that live only
> in Supabase Edge Function secrets. The anon key above is safe to embed.

---

## 4. Run Database Migrations

In the **Supabase Dashboard → SQL Editor**, run each file in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_transactions_and_loan_fields.sql`
3. `supabase/migrations/0003_goals_and_notifications.sql`
4. `supabase/migrations/0004_repayment_rpc.sql`
5. `supabase/migrations/0005_loan_offer_acceptance.sql`

Or via CLI:

```bash
npx supabase db push --project-ref yuqhwjvmamjwklumlhtt
```

---

## 5. Deploy Edge Functions to Supabase

### Option A — GitHub Actions (recommended)

1. Go to **https://github.com/jolems123/Kuula/settings/secrets/actions**
2. Add secret: `SUPABASE_ACCESS_TOKEN` → your `sbp_` token from
   https://supabase.com/dashboard/account/tokens
3. Add variable (not secret): `SUPABASE_PROJECT_REF` → `yuqhwjvmamjwklumlhtt`
4. Every push to `main` that changes `supabase/functions/` auto-deploys.

### Option B — Manual CLI

```bash
npx supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt
```

---

## 6. Set Edge Function Secrets

In **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Value |
|--------|-------|
| `MARZPAY_API_KEY` | Your MarZPay API key |
| `MARZPAY_API_SECRET` | Your MarZPay API secret |
| `MARZPAY_WEBHOOK_SECRET` | A random 32+ char string |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API |
| `CORS_ORIGIN` | `https://app.kuula.ug` (your production URL) |

---

## 7. Build the Web App (for Capacitor sync)

```bash
npm run build          # produces dist/
npm run cap:sync       # copies dist/ into android/ and ios/
```

For local native development:
```bash
npm run cap:android    # opens Android Studio
npm run cap:ios        # opens Xcode (Mac only)
```

---

## 8. Set Up GitHub Secrets for CI

Go to **Settings → Secrets and variables → Actions** in your GitHub repo.

### Required for CI (every push to main)

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://yuqhwjvmamjwklumlhtt.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your publishable anon key |

### Required for Edge Function auto-deploy

| Type | Name | Value |
|------|------|-------|
| Secret | `SUPABASE_ACCESS_TOKEN` | `sbp_` token from Supabase dashboard |
| Variable | `SUPABASE_PROJECT_REF` | `yuqhwjvmamjwklumlhtt` |

### Required for signed Android builds

Generate a release keystore:

```bash
keytool -genkeypair -v \
  -keystore kuula-release.keystore \
  -alias kuula \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Then add 4 secrets:

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 kuula-release.keystore` |
| `ANDROID_KEY_ALIAS` | `kuula` |
| `ANDROID_KEY_PASSWORD` | Your key password |
| `ANDROID_STORE_PASSWORD` | Your keystore password |

### Required for signed iOS builds

| Secret | Value |
|--------|-------|
| `APPLE_TEAM_ID` | From Apple Developer → Membership |
| `APPLE_CERT_BASE64` | `base64 -w0 distribution.p12` |
| `APPLE_CERT_PASSWORD` | Your `.p12` export password |
| `APPLE_PROVISION_BASE64` | `base64 -w0 Kuula.mobileprovision` |

---

## 9. Build Signed Mobile Apps

### Via GitHub Actions (recommended)

1. Push your code to `main` — CI runs automatically (typecheck + build + test)
2. For a signed build: go to **Actions → Build Mobile Apps → Run workflow**
3. Select platforms (`android` and/or `ios`) and build type (`release`)
4. Download the `.aab` or `.ipa` from the workflow artifacts

### Via Local Machine

**Android:**
```bash
npm run cap:sync
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**iOS (Mac only):**
```bash
npm run cap:sync
npm run cap:ios
# In Xcode: Product → Archive → Distribute App → App Store Connect
```

---

## 10. Upload to Stores

### Google Play

1. Go to [Play Console](https://play.google.com/console)
2. Create app → set package ID `ug.kuula.app`
3. Complete the **Personal Loan declaration** (mandatory for Uganda)
4. Fill in the **Data Safety form** (National ID, financial data, biometric data)
5. Upload the `.aab` from step 9
6. Start with **Internal Testing** → **Closed Testing** → **Production** (10% rollout)

### Apple App Store

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create app → SKU `kuula`, Bundle ID `ug.kuula.app`
3. Upload the `.ipa` via Xcode or Transporter
4. Fill in **Privacy Nutrition Labels** (financial data, National ID, biometric)
5. Enable **3.2.1(viii) loan-app declaration** (submitting org must be the lender)
6. Submit for review

---

## 11. End-to-End Payment Test (before going live)

1. Register a new account in the app
2. Apply for a loan (smallest amount, e.g. UGX 50,000)
3. Admin logs in → approves the loan
4. Customer sees "offered" status → taps Accept
5. Confirm the MoMo prompt appears on the test phone
6. MarZPay POSTs to the webhook → loan status → "approved"
7. Customer makes a repayment → confirm webhook settles it → loan → "paid"

---

## Quick Reference

| Item | Value |
|------|-------|
| Supabase project | `yuqhwjvmamjwklumlhtt` |
| Supabase dashboard | https://supabase.com/dashboard/project/yuqhwjvmamjwklumlhtt |
| GitHub repo | https://github.com/jolems123/Kuula |
| Bundle ID | `ug.kuula.app` |
| Max APR | 33.6% (UMRA compliant, below Apple 36% cap) |
| Min loan term | 90 days (above Google Play 60-day floor) |
| Interest type | Simple (never compound) |