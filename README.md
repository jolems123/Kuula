<div align="center">

# Kuula

**Fast, secure micro-loans and savings for Uganda — powered by mobile money.**

Borrow in minutes, save with a goal, and repay straight from MTN MoMo or Airtel
Money. Kuula runs as an installable web app (PWA) and as native iOS and Android
apps from a single React codebase.

</div>

---

## What is Kuula?

Kuula is a Ugandan fintech app for instant micro-lending and goal-based savings.
It moves **real money** over mobile money rails, so the whole product is built
around one principle: **never show a number the backend didn't confirm.**

### For borrowers
- **Loans in minutes** — apply, get a real-time credit decision, and receive
  funds directly to MTN MoMo or Airtel Money.
- **Flexible repayment** — pay the full balance or a partial amount; collections
  are initiated on your phone for approval.
- **Savings** — set aside money toward a goal and track progress.
- **Wallet** — top up, view balance, and see a full transaction history.
- **Transparent terms** — every loan shows its real cost up front; pricing is
  compliance-checked (APR capped, minimum term enforced, simple interest only).
- **Your language** — full UI in **English, Luganda (Luganda), and Swahili**.

### For operators (admin)
- Loan review, approvals, disbursements, and collections dashboards.
- Customer support, savings/credit management, reporting, and audit views.

## How it runs

The same React UI ships three ways — only the shell differs:

| Target | Command | Notes |
|--------|---------|-------|
| **Web / PWA** | `npm run dev` | Installable via the browser's "Add to Home Screen" / "Install" prompt. |
| **Android** | `npm run cap:android` | Opens the Capacitor-wrapped Android Studio project. |
| **iOS** | `npm run cap:ios` | Opens the Capacitor-wrapped Xcode project (Mac only). |

## Tech stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, shadcn/ui, `HashRouter`
  (works under `file://` in the native webview), `react-i18next` (en / lg / sw).
- **Mobile:** Capacitor (StatusBar, SplashScreen, App back-button, safe-area insets).
- **Payments:** MTN MoMo & Airtel Money collections and disbursements.
- **Backend (production):** Supabase (Postgres + Auth + RLS) with **MarzPay**
  Edge Functions for real mobile-money collection, disbursement, and webhooks.
- **Backend (legacy/reference):** a Node/Express + Postgres service kept for
  parity and local development.

## Quick start (demo mode)

```bash
npm install            # install dependencies
npm run dev            # start the dev server → http://localhost:5000
```

With `VITE_USE_API=false` (the default) the app is **fully functional out of the
box without a backend**, using two seeded demo accounts:

| Account | How to log in | PIN |
|---------|---------------|-----|
| Amara Nakato (customer) | tap **USER** | `1234` |
| Admin Kavuma (operator) | tap **ADMIN** | `1234` |

> Demo mode is the only place the app shows illustrative figures. The moment a
> real backend is wired up (`VITE_USE_API=true`), every balance, loan, and
> transaction comes from the server — and screens fail loudly (clear error /
> empty states) rather than ever displaying a fabricated amount.

## Connecting a real backend

Kuula switches backends with a single env var — no code changes required.

### Supabase + MarzPay (production)

```bash
VITE_USE_API=true
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Server-side secrets (MarzPay API key/secret, webhook secret, Supabase service
key) live **only** as Supabase Edge Function secrets — never as `VITE_*` vars.
The MarzPay Edge Functions live in `supabase/functions/`:

- `marzpay-collect` — initiate a mobile-money collection (repayment).
- `marzpay-disburse` — disburse loan funds to the borrower.
- `marzpay-webhook` — verify and process MarzPay status callbacks (fails
  **closed** if the webhook secret is missing).
- `auto-collect` — scheduled repayment collection sweep.
- `credit-score` — credit decisioning.

### Node/Express (legacy)

```bash
VITE_USE_API=true
VITE_BACKEND=node        # default
npm run api              # runs the reference server in server/
```

See `backend/` for the fuller Express + Postgres implementation and its own
README.

## Internationalization

All copy is translated in `src/i18n/locales/{en,lg,sw}.json`. Add a key to all
three files; the app selects a locale at runtime via `react-i18next`.

## Environment variables

Copy `.env.example` to `.env.local` and adjust. **Every `VITE_*` var is inlined
into the public bundle**, so secrets (MTN/Airtel/MarzPay keys, JWT secret,
Supabase service key) must never be `VITE_*` — they belong in Edge Function
secrets or `backend/.env` only.

## Verifying it works

```bash
npm run typecheck        # 0 TypeScript errors
npm run build            # production bundle in dist/
npm test                 # unit tests (vitest)
npm run sweep            # headless route sweep — visits every registered screen,
                         #   fails if any throws or renders blank
npm run check:pricing    # asserts loan pricing stays within compliance limits
```

## Mobile (Capacitor)

The iOS/Android projects are already generated. After any web change:

```bash
npm run cap:sync         # build web + sync assets into native projects
npm run cap:android      # open Android Studio
npm run cap:ios          # open Xcode (Mac only)
```

Native integrations (StatusBar, SplashScreen, hardware Back button, safe-area
insets) are guarded by `Capacitor.isNativePlatform()`, so the exact same React
tree runs on web and native.

## Project structure

```
src/
  main.tsx                 # React entrypoint
  lib/native-chrome.ts     # Capacitor plugin wiring (no-op on web)
  app/
    App.tsx                # HashRouter + shell + auth guards
    config/env.ts          # VITE_* env validation
    context/AppContext.tsx # session / user / credit / loan state
    api/
      client.ts            # provider-switched API client (node | supabase)
      supabase-service.ts  # Supabase implementation
      types.ts             # shared API types
    lib/supabase.ts        # lazy Supabase client
    screens/registry.ts    # lazy-loaded screens + access levels
    components/
      screens/             # all screen components (customer + admin)
      ui/                  # shadcn/ui component library
      BottomNav.tsx        # customer tab bar
      AdminLayout.tsx      # admin sidebar shell
  i18n/locales/            # en / lg / sw translations
  styles/                  # Tailwind + theme CSS
public/                    # PWA manifest + icons
capacitor.config.ts        # native app config
android/ , ios/            # generated Capacitor native projects
backend/                   # Node/Express + Postgres backend (legacy/reference)
server/                    # zero-dep Node reference backend
supabase/                  # migrations + Edge Functions (MarzPay, production)
scripts/                   # env checks, route sweep, pricing compliance
```

## Compliance & safety

- **No fabricated financial data.** In server mode, balances and transactions
  are only ever what the backend returns; loading/error/empty states are shown
  instead of placeholder numbers, and payments are blocked when data is missing
  or failed to load.
- **Pricing guardrails.** APR is capped, a minimum loan term is enforced, and
  interest is simple (never compounded); `npm run check:pricing` guards this.
- **Fail closed.** Security-sensitive paths (e.g. the MarzPay webhook) reject
  requests when required secrets are absent rather than trusting them.
