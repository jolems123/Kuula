# Kuula Codemagic release setup

Kuula uses `codemagic.yaml` at the repository root for signed Android and iOS production-candidate builds.

## App identity

The canonical mobile application identifier is **`com.kuula.ap`** for both Android and iOS. Use this exact identifier in Google Play, Apple Developer/App Store Connect, provisioning profiles, Firebase/push configuration, deep links, and any provider configuration tied to the native app.

## Required Codemagic app setup

1. Add `jolems123/Kuula` to Codemagic and select YAML configuration.
2. Scan `main` for `codemagic.yaml`.
3. Create an environment variable group named `kuula_production`.
4. Add `VITE_API_BASE_URL`, pointing to the HTTPS Kuula Node API endpoint.

`VITE_API_BASE_URL` is bundled into the mobile application and is not a secret. Never add `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, MarZPay secrets, Smile ID secrets, AWS/S3 credentials, admin passwords, or service-role credentials as `VITE_*` values.

## Android signing

Upload the Kuula release keystore in Codemagic and use the reference name `kuula_android_release`. The Android package/application ID is `com.kuula.ap`. The workflow produces a signed APK and AAB.

## iOS signing

Configure an App Store distribution certificate and provisioning profile for bundle identifier `com.kuula.ap`. The workflow uses workspace `ios/App/App.xcworkspace`, scheme `App`, `xcode-project use-profiles`, and `xcode-project build-ipa`.

## Build gates

Both workflows run production environment validation, deterministic dependency installation, TypeScript typecheck, unit tests, Pact consumer contracts, pricing compliance/parity, the production Vite build, and Capacitor sync before native packaging.

## Release safety

The backend must keep `REAL_MONEY_ENABLED=false` until provider, database recovery, KYC/SMS, reconciliation, and financial end-to-end release gates are proven. This is a backend variable and must never be exposed as `VITE_*`.
