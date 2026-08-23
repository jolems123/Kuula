# Kuula Codemagic release setup

Kuula uses `codemagic.yaml` at the repository root for signed Android and iOS production-candidate builds.

## Required Codemagic app setup

1. Add `jolems123/Kuula` to Codemagic and select YAML configuration.
2. After this change is merged, scan the `main` branch for `codemagic.yaml`.
3. Create an environment variable group named `kuula_production`.
4. Add `VITE_API_BASE_URL` to that group, pointing to the HTTPS Kuula Node API production/staging endpoint.

`VITE_API_BASE_URL` is bundled into the mobile application and is not a secret. Do not add backend secrets to Codemagic mobile variables. In particular, never add `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, MarZPay secrets, Smile ID secrets, AWS/S3 credentials, admin passwords, or service-role credentials as `VITE_*` values.

## Android signing

In Codemagic **Teams / Code signing identities / Android keystores**, upload the Kuula release keystore and give it the exact reference name:

`kuula_android_release`

Codemagic will provide `CM_KEYSTORE_PATH`, `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, and `CM_KEY_PASSWORD` to the workflow. `android/app/build.gradle` reads those variables only during CI signing while preserving the existing local Gradle-property signing path.

The Android workflow produces both a signed APK and a signed AAB.

## iOS signing

Upload or configure an App Store distribution certificate and provisioning profile in Codemagic for bundle identifier:

`ug.kuula.app`

The YAML uses:

- distribution type: `app_store`
- workspace: `ios/App/App.xcworkspace`
- scheme: `App`
- bundle identifier: `ug.kuula.app`

Codemagic applies the matching profiles using `xcode-project use-profiles` and builds the IPA with `xcode-project build-ipa`.

## Build gates

Before native packaging, both workflows run:

- production environment validation
- deterministic root dependency install
- TypeScript typecheck
- unit tests
- Pact consumer contract tests
- pricing compliance checks
- client/server pricing parity
- Vite production build
- Capacitor platform sync

A failure in any gate stops native artifact creation.

## Release safety

The mobile app must point to a backend where `REAL_MONEY_ENABLED=false` until the live provider, database recovery, KYC/SMS, reconciliation, and financial end-to-end release gates are independently proven. `REAL_MONEY_ENABLED` belongs on the backend deployment and must never be exposed as a frontend `VITE_*` variable.

## Workflows

- `Kuula Android Production` — Linux X2, Node 22, npm 10.9.2, Java 21.
- `Kuula iOS Production` — Apple Silicon M2, Node 22, npm 10.9.2, latest Xcode, CocoaPods.

Both workflows trigger from `main` pushes and `v*` tags. Store publishing is intentionally not enabled yet; first establish repeatable signed builds and download/test the resulting artifacts before enabling automatic Play Console or App Store Connect publishing.
