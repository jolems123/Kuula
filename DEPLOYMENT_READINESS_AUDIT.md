# Kuula Mobile — App Store Deployment Readiness Audit

**Date:** 2026-06-12 (remediation applied same day — see §0)
**Verdict:** 🟡 **TECHNICALLY PACKAGED, PENDING BACKEND + COMPLIANCE** — originally a
web-based clickable prototype (Figma Make export). The codebase has since been converted
into a routed, auth-guarded mobile app with generated Capacitor iOS/Android projects
(§0). Remaining blockers are the real backend/API and the legal/compliance work
(UMRA license, store declarations, signing accounts), which cannot be done in code.

## 0. Remediation status (applied 2026-06-12)

| Finding | Status |
|---|---|
| Business logic & compliance pricing | ✅ Real domain core (`server/core.mjs`): APR-capped pricing (all-in ≤ 33.6%, under Apple's 36%), 90-day min term (above Google's 60-day floor), simple interest; AI credit scoring from 5 weighted data sources; sandbox MoMo/Airtel disbursement; auto-collection ladder; savings interest + credit-ladder rate discount. Wired into loan/credit/savings/payment/about screens and verified live. |
| 3.1 No native projects | ✅ Capacitor 7 added; `android/` + `ios/` generated, appId `ug.kuula.app`, v2.4.1, icons + splash for both platforms |
| 3.2 Prototype gallery shell | ✅ Replaced with `react-router` routes (192 screens), auth/role guards, full-screen mobile layout; verified in headless Chromium |
| 3.3 No backend | 🟡 Reference API added (`server/`, zero-dependency Node): hashed credentials, HMAC tokens, login/admin-login/OTP/me endpoints **plus support messaging and the loan-application lifecycle** (`/api/messages`, `/api/loans/applications`, `/api/loans/applications/decision`). With `VITE_USE_API=true` customer and admin sync across devices: customer chat ↔ admin inbox, and customer apply → admin approve/reject → customer status. Production still needs real infra (database, SMS OTP, MoMo integration, deployment) |
| 3.4 S1 hardcoded admin creds | ✅ Removed; admin mock auth is dev-only, production shows staff-portal message |
| 3.4 S2 shipped PIN | ✅ `loginPin` deleted from mock data; prod bundle scanned clean |
| 3.4 S3 client-side MoMo secrets | ✅ Secret keys removed from `env.ts` / `.env.example` with server-side-only warnings |
| 3.4 S4 admin bundled | 🟡 Admin screens now lazy-loaded (excluded from initial bundle) and role-guarded; full separation into its own web app still recommended |
| 3.5 Account deletion (Apple 5.1.1(v)) | ✅ `DeleteAccountScreen` added with confirmation flow, linked from Privacy & Security |
| 3.6 No tsconfig/typecheck | ✅ `tsconfig.json` (strict) + `@types/react`; `npm run typecheck` passes with 0 errors |
| 3.6 No lockfile | ✅ `package-lock.json` committed; `.gitignore` updated |
| 3.6 react as optional peer | ✅ Direct dependencies now |
| 3.6 1.16 MB bundle | ✅ Code-split: 234 kB entry + lazy per-screen-group chunks |
| 3.6 Dependency vulnerabilities | ✅ vite → 6.4.3, react-router → 7.17.0; `npm audit`: 0 vulnerabilities |
| 3.6 No CI | ✅ GitHub Actions workflow: typecheck → production build → API smoke test → full 191-route browser sweep on every push/PR |
| 3.7 Icons/splash | ✅ Generated from brand tile via `@capacitor/assets` (45 assets) |
| 3.5 Licensing/declarations/signing | 🔴 Business/legal steps — see §3.5 and §4 Phase 4 |

The sections below are the original audit, kept for reference.

---

## 1. What the audit covered

- Full source review: `src/app` (74 screen/components files, ~129 files total)
- Build verification: `vite build` ✅ succeeds (4.8 s)
- Strict TypeScript check (no tsconfig exists in repo — one was synthesized for the audit)
- Dependency, secret-handling, and configuration review
- Apple App Store Review Guidelines + Google Play policy assessment for a loan/fintech app

## 2. What is in good shape

| Area | Status |
|---|---|
| Production build | ✅ Compiles cleanly with Vite 6 |
| Screen coverage | ✅ 201 designed screens (101 customer + 100 admin) covering the full product surface |
| Env hygiene | ✅ `.env.example` template, all `.env*` files gitignored, centralized `src/app/config/env.ts` |
| State management | ✅ Typed `AppContext` reducer with session/role/profile/messages |
| Role gating | ✅ Prototype-level guard blocks admin screens for non-admin role |
| Brand asset | ✅ One 1024×1024 icon tile exists (`src/imports/kuula-tile-green-1024.png`) |

## 3. Blockers

### 3.1 Platform — there is no mobile app to submit (CRITICAL)

- No iOS or Android project exists. No Capacitor, React Native, Expo, or Flutter — this is
  a Vite + React **web** project only.
- App stores accept signed binaries built from native projects, with bundle IDs,
  certificates/provisioning profiles (Apple) and an upload keystore (Android). None of
  this exists.
- Even after wrapping, Apple Guideline **4.2 (Minimum Functionality)** rejects plain
  web-view wrappers. The app must use real native capabilities (biometric auth, push
  notifications, secure storage — all of which the designs already promise).

### 3.2 The app shell is a prototype gallery, not an app (CRITICAL)

`src/app/App.tsx` renders a **screen-browser for designers**: a dark sidebar listing all
201 screens by number ("1.1 Welcome/Login", "A3.2 App Detail"…), a Customer/Admin tab
switcher, a desktop `PhoneFrame` around each screen, and a "201 SCREENS · 101 CUSTOMER +
100 ADMIN" footer. Navigation is a `useState` string + 200-case switch.

- `react-router` 7 is in `package.json` but **never used**.
- There is no deep linking, no back-stack, no auth-driven routing, no protected routes.

### 3.3 No backend — everything is fake (CRITICAL)

- All data comes from `src/app/data/mockData.json`.
- `AppProvider` **auto-logs in a mock user at startup** with token
  `"mock_session_token_dev_only"` — there is no real authentication at all.
- Loan application, KYC, payments, OTP, support chat are all simulated client-side.
- Submitting this would be rejected immediately (Apple 2.1 App Completeness / demo
  content; Play "broken functionality" policy) — and it would be misrepresentation for a
  financial product.

### 3.4 Security findings (CRITICAL for fintech)

| # | Finding | Location |
|---|---|---|
| S1 | Hardcoded admin credentials with on-screen hint: "Use admin@kuula.ug / admin" | `AdminLoginScreen.tsx:22` |
| S2 | Test user login PIN `"1234"` shipped in bundle | `mockData.json` (`testUsers[0].loginPin`) |
| S3 | `VITE_MTN_API_KEY`, `VITE_MTN_SUBSCRIPTION_KEY`, `VITE_AIRTEL_CLIENT_ID` are **client-exposed by design** (Vite inlines all `VITE_*` vars into the public JS bundle). Mobile-money provider secrets must live only on a backend. | `.env.example`, `src/app/config/env.ts` |
| S4 | Entire **admin console is bundled into the customer app** (fraud tools, collections, legal escalation, staff management). Hidden role-gated functionality in a store binary is both an attack surface and a review red flag. Admin must be a separate web app. | `App.tsx` |
| S5 | Client-side-only role gating; with no server there is no real authorization | `App.tsx:411` |
| S6 | No secure token storage, session expiry enforcement, PIN hashing, or biometric integration — all UI-only | `AppContext.tsx` |

### 3.5 Store-policy compliance for a loan app (CRITICAL — longest lead time)

Kuula is a **personal-loan app**, the most heavily policed app category:

**Google Play (Financial Services / Personal Loans policy)**
- Mandatory **Personal Loan declaration** in Play Console.
- Proof of license for each target country — for Uganda: **UMRA (Uganda Microfinance
  Regulatory Authority) money-lender license** documentation.
- Full disclosure of APR/fees/repayment terms in the store listing **and** in-app.
- Minimum repayment tenure rules (no short-term ≤60-day loans).
- Personal-loan apps may not access contacts, photos, or precise location.
- **Data safety form** covering national-ID, financial, and biometric data.

**Apple App Store**
- Guideline **3.2.1(viii)**: loan apps must be submitted **by the financial institution
  itself** — an Apple Developer (Organization) account in the company's legal name, not an
  individual account.
- Apple caps loan APR (max 36%) and bans loans requiring full repayment in ≤60 days.
- Guideline **5.1.1(v)**: in-app **account deletion** is mandatory (no screen exists).
- Privacy "nutrition labels" for financial/ID/biometric data.

**Both stores**
- Hosted **privacy policy URL** (real document — the in-app `CustomerPrivacyPolicyScreen`
  and `CustomerTermsScreen` contain placeholder copy).
- Real KYC/consent flows for national-ID collection; biometric-data consent.

### 3.6 Engineering quality gaps (HIGH)

| Gap | Detail |
|---|---|
| No TypeScript config | No `tsconfig.json`; nothing type-checks the code. A strict audit pass produced **3,550 errors** — ~3,500 from missing `@types/react`/`@types/react-dom` (not installed), ~20 genuine type errors (TS2322 etc.) |
| No tests | Zero test files, no test runner |
| No lint/format | No ESLint/Prettier config |
| No CI | No workflows; nothing gates merges |
| No lockfile in git | `pnpm-lock.yaml` is **gitignored** — builds are not reproducible |
| Fragile packaging | `react`/`react-dom` are declared only as *optional peer dependencies* (Figma Make artifact); they must be direct dependencies |
| Bundle size | Single 1.16 MB JS chunk (267 KB gzip), no code splitting / lazy routes |
| Package identity | `package.json` name is `@figma/my-make-file`, version `0.0.1` (UI claims v2.4.1) |

### 3.7 Missing release collateral (MEDIUM)

- App icons (full adaptive-icon set for Android, all iOS sizes — only the single 1024 tile exists)
- Splash screens, store screenshots, feature graphic (Play), promo text & descriptions
- Versioning scheme + build numbers; release signing (keystore / certificates)
- Support URL & contact (store listing requirement)

---

## 4. Roadmap to store readiness

**Phase 1 — Productize the frontend (1–2 weeks)**
Replace the gallery shell in `App.tsx` with real `react-router` routes and an
auth-guarded navigation flow; delete `PhoneFrame`/sidebar from the app build; strip the
admin screens into a separate web project; remove auto-login, mock credentials, and the
demo PIN; add `tsconfig.json` + `@types/react` + `@types/react-dom` and fix the ~20 real
type errors; commit the lockfile; make `react`/`react-dom` direct dependencies; add
lazy-loaded routes to break up the 1.16 MB bundle.

**Phase 2 — Backend & real integrations (4–8 weeks, parallel)**
API service with real auth (phone + OTP), session management, KYC vendor integration,
loan ledger, and **server-side** MTN MoMo & Airtel Money integration (provider keys never
leave the server). Wire the frontend to it; delete `mockData.json` from the production
path.

**Phase 3 — Native wrapper (1–2 weeks)**
Add **Capacitor** (recommended — keeps this React codebase): `@capacitor/ios`,
`@capacitor/android`, plus native plugins for biometric auth, secure storage
(Keychain/Keystore for tokens), push notifications, and status-bar/safe-area handling.
This also satisfies Apple 4.2 minimum-functionality. Configure bundle ID
(e.g. `ug.kuula.app`), icons, splash screens, signing.

**Phase 4 — Compliance & legal (start immediately — longest lead time)**
UMRA licensing paperwork; Apple Developer **Organization** account in the lender's legal
name; Google Play Console + Personal Loan declaration; real privacy policy & terms
(hosted + in-app); account-deletion flow; APR/fee disclosure screens; data-safety /
privacy-label submissions.

**Phase 5 — Hardening & release (1–2 weeks)**
ESLint + typecheck + tests + CI gating; penetration test (strongly advised for a lending
app); internal testing track (Play) and TestFlight; staged rollout.

**Realistic overall timeline: ~2–3 months**, gated primarily by backend build-out and
licensing/compliance — not by UI work, which is largely done.

---

## 5. Suggested immediate next steps in this repo

1. Add `tsconfig.json`, install `@types/react` + `@types/react-dom`, fix real type errors, add `"typecheck"` script.
2. Stop gitignoring the lockfile; move `react`/`react-dom` to `dependencies`.
3. Split admin screens out of the mobile bundle.
4. Replace the prototype shell with routed, auth-guarded navigation.
5. Remove `admin/admin` hint, demo PIN, and auto-login mock session.
6. Scaffold Capacitor iOS/Android projects.
