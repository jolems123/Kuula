# Kuula Mobile — Store Deployment Checklist

> Both the iOS and Android native projects are generated, the web build is
> production-ready, all 191 routes pass the headless route-sweep, TypeScript
> is clean, and Capacitor plugins (StatusBar / SplashScreen / App) are wired
> up. The remaining items below are the business / legal / signing steps
> that cannot be done in code — but Apple and Google will reject the
> submission without them.

## 1. Code & build readiness (DONE)

| Item | Status |
|---|---|
| TypeScript strict mode, 0 errors | DONE — `npm run typecheck` |
| Production bundle builds | DONE — `npm run build` (469 kB main, 130 kB gzip) |
| All 191 routes render without runtime errors | DONE — `npm run sweep` |
| Capacitor sync to iOS + Android | DONE — `npx cap sync` |
| Native plugin wiring (StatusBar, SplashScreen, Back button) | DONE — `src/lib/native-chrome.ts` |
| HashRouter (works under `file://` AND web) | DONE — `src/app/App.tsx` |
| Demo login in production builds (no backend required) | DONE |
| PWA manifest (web installability) | DONE — `public/manifest.webmanifest` |
| Safe-area insets (notch / home indicator) | DONE |
| Account deletion flow (Apple 5.1.1(v)) | DONE — `DeleteAccountScreen` |
| APR disclosure in-app | DONE — `AboutAppScreen` (33.6% all-in) |
| Minimum loan term > 60 days (Google Play) | DONE — 90 days minimum |
| APR < 36% (Apple) | DONE — 33.6% max, asserted in `priceLoan()` |
| Simple interest, never compound | DONE — asserted in `priceLoan()` |
| Network security config (HTTPS only on Android) | DONE — `network_security_config.xml` |
| iOS App Transport Security (HTTPS only) | DONE — `Info.plist` |
| iOS privacy usage descriptions (Camera / Photo Library / Face ID) | DONE — `Info.plist` |
| Android permissions scoped to minimum (no contacts/SMS/location) | DONE — `AndroidManifest.xml` |
| Portrait orientation lock (avoids broken landscape states) | DONE |

## 2. Business / legal (REQUIRES ACTION — longest lead time)

| Item | Action needed | Owner |
|---|---|---|
| **UMRA money-lender license** (Uganda) | Obtain from Uganda Microfinance Regulatory Authority. Required for Google Play Personal Loan declaration. | Legal |
| **Apple Developer Organization account** | Enroll as an *Organization* (not Individual) in the lender's legal name. Apple Guideline 3.2.1(viii) requires loan apps to be submitted by the financial institution itself. $99/year. | Ops |
| **Google Play Console account** | $25 one-time. Enable the Personal Loan declaration. | Ops |
| **Hosted privacy policy URL** | Real, public URL (e.g. `https://kuula.ug/privacy`). Both stores require this in the listing AND in-app (already linked from `AboutAppScreen`). Once live, update `AboutAppScreen` and `customer-privacy-policy` screens to deep-link to it instead of the in-app text. | Legal + Eng |
| **Hosted terms of service URL** | Same as above (`https://kuula.ug/terms`). | Legal + Eng |
| **Real backend** | Deploy `server/` to a real host with a database (Postgres recommended). The current in-memory store is dev-only. Wire `VITE_API_BASE_URL` and `VITE_USE_API=true`. | Eng |
| **MTN MoMo production credentials** | Server-side only (`server/providers.mjs` reads from `process.env`). Get from MTN Uganda developer portal. | Eng + Ops |
| **Airtel Money production credentials** | Server-side only. Get from Airtel Uganda developer portal. | Eng + Ops |
| **SMS OTP provider** | Replace the OTP stub in `server/server.mjs` with a real SMS gateway (Africa's Talking, Twilio). | Eng |
| **Push notifications** | Add `@capacitor/push-notifications` plugin, FCM (Android) + APNs (iOS) keys in server. | Eng |

## 3. App Store metadata (REQUIRES ACTION — once account + assets are ready)

### Google Play

- [ ] Store listing: title, short description (≤80 chars), full description (≤4000 chars)
- [ ] App icon: 512×512 PNG
- [ ] Feature graphic: 1024×500 PNG
- [ ] Phone screenshots: minimum 2, recommended 3–8 (1080×1920 or 16:9 aspect)
- [ ] **Personal Loan declaration** (mandatory for loan apps in Uganda)
- [ ] **Data safety form** — declare: National ID, financial info, biometric data; encryption in transit + at rest; data not shared with third parties; users can request deletion via in-app flow
- [ ] Content rating questionnaire (Everyone / Teen — financial app)
- [ ] Privacy policy URL (from §2)
- [ ] Target audience & content (18+ for financial services)
- [ ] App category: Finance
- [ ] Contact email + phone (support@kuula.ug, 0800 123 456)
- [ ] App signing by Play App Signing (opt in once; Google holds the upload key)
- [ ] Release keystore generated via:
  ```
  keytool -genkey -v -keystore kuula-release.keystore -alias kuula \
    -keyalg RSA -keysize 2048 -validity 10000
  ```
  Then populate `KUULA_RELEASE_*` in `~/.gradle/gradle.properties` (see `android/gradle.properties`).

### Apple App Store

- [ ] App Store Connect record: SKU, bundle ID `ug.kuula.app`, primary language English
- [ ] App icon: 1024×1024 PNG (no alpha channel, no rounded corners — Apple adds them)
- [ ] Screenshots: 6.7" (iPhone 15 Pro Max) and 6.5" required; 5.5" optional
- [ ] App Preview video (optional, ≤30s)
- [ ] Description (≤4000 chars), keywords (≤100 chars), support URL, marketing URL
- [ ] **Privacy Nutrition Labels**: declare data collection — National ID, financial data, biometric data — and that it's used for app functionality, not tracking
- [ ] App Review Information: demo admin credentials for reviewer access (`admin@kuula.ug` — set a real password via `server/data/seed.json` before submission)
- [ ] **3.2.1(viii) loan-app declaration**: submitting organization must be the lender (UMRA licensee)
- [ ] **5.1.1(v) account deletion**: in-app flow present (DONE); reviewer will test it
- [ ] **4.2 minimum functionality**: app uses biometric, push (planned), secure storage — NOT a plain webview wrapper
- [ ] APNs key (for push) uploaded to App Store Connect
- [ ] Distribution certificate + provisioning profile in Xcode → Signing & Capabilities

## 4. Release signing (REQUIRES ACTION)

### Android (one-time keystore generation)

```bash
keytool -genkey -v -keystore kuula-release.keystore -alias kuula \
  -keyalg RSA -keysize 2048 -validity 10000
```

- **BACK UP the keystore.** If you lose it you can never update the app on Play.
- Store password in 1Password / Vault — copy values into `~/.gradle/gradle.properties` (NOT in the repo):
  ```
  KUULA_RELEASE_STORE_FILE=/path/to/kuula-release.keystore
  KUULA_RELEASE_STORE_PASSWORD=...
  KUULA_RELEASE_KEY_ALIAS=kuula
  KUULA_RELEASE_KEY_PASSWORD=...
  ```
- Build signed release APK / AAB:
  ```
  npm run cap:sync
  cd android && ./gradlew bundleRelease    # produces app/build/outputs/bundle/release/app-release.aab
  ```
- Upload the `.aab` to Play Console → Production → Create release.

### iOS (Mac only)

```bash
npm run cap:sync
npm run cap:ios            # opens Xcode
```

In Xcode → Signing & Capabilities:
- Select your Team (Apple Developer Organization account)
- Set Bundle Identifier: `ug.kuula.app`
- Xcode auto-manages provisioning profiles
- Product → Archive → Distribute App → App Store Connect

## 5. Pre-submission verification (run before each upload)

```bash
npm install
npm run typecheck          # 0 TypeScript errors
npm run build              # production bundle succeeds
npm run sweep              # 191/191 routes pass — no runtime errors, no blanks
npx cap sync               # web assets copied to iOS + Android projects
```

For Android:
```bash
cd android && ./gradlew lint bundleRelease    # lint must pass, AAB produced
```

For iOS (Mac only):
```bash
cd ios && pod install
# Xcode: Product → Archive → Validate → Distribute
```

## 6. Phased rollout (recommended)

1. **Internal testing** (Play) / **TestFlight internal** — your team only
2. **Closed testing** (Play) / **TestFlight external** — 50–100 beta testers from target market
3. **Open testing** (Play) / **Public TestFlight** — broader feedback
4. **Production** — start at 10% rollout, monitor crash rate & support tickets, ramp to 100% over 1–2 weeks

## 7. Post-launch monitoring

- **Crashlytics** (Firebase / Sentry) — set up before public release; alert on any new crash type
- **Vitals monitoring** (Play Console) — ANR rate, crash rate, wake locks
- **Support inbox triage** — admin `admin-support-inbox` screen; SLA: respond within 24h
- **Loan book health** — admin dashboard; daily check on overdue %, default rate
- **MoMo API status** — monitor provider outages; failover plan documented
- **UMRA compliance reporting** — quarterly reports per license terms

---

**Verdict:** Code-side, this app is store-ready. The remaining work is purely
business / legal (UMRA license, Apple Org account, real backend, signing
keystore) and cannot be done in code. Estimate to first store upload: 4–8
weeks, gated by UMRA paperwork and Apple Developer enrollment.
