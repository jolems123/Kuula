# GitHub Secrets for CI + Mobile Builds

> Copy-paste reference for the repository secrets you need to set at
> **Settings → Secrets and variables → Actions** in `jolems123/KuulaMobile`.
> Secrets are never logged and never exposed to PRs from forks.

## Required for CI (every push)

These are optional in dev forks — CI stays green without them — but
**must be set in the production repo** for the app to talk to the real
backend:

| Secret name | Purpose | Example value |
|---|---|---|
| `VITE_API_BASE_URL_PROD` | Backend URL baked into the mobile build | `https://api.kuula.ug` |
| `VITE_SUPABASE_URL` | Only if you use the Supabase backend (leave unset for node backend) | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Same — Supabase publishable key | `sb_publishable_…` |

## Required for backend tests (CI `backend` job)

These are auto-provisioned by the GitHub Actions `services` block —
**you do not need to set them yourself**. They're listed here for
transparency:

| Variable | Set by |
|---|---|
| `DATABASE_URL` | `services.postgres` job |
| `JWT_SECRET` | Hardcoded in workflow (CI-only) |
| `NODE_ENV` | Hardcoded in workflow (`test`) |

## Required for Android signed AAB (workflow_dispatch → release)

Generate a release keystore locally with:

```bash
keytool -genkeypair \
  -v \
  -keystore kuula-release.keystore \
  -alias kuula \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Then base64-encode it and add the result as a secret:

```bash
base64 -w0 kuula-release.keystore | pbcopy   # macOS
# or
base64 -w0 kuula-release.keystore | xclip -sel clip   # Linux
```

Add four secrets:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The base64-encoded `.keystore` file |
| `ANDROID_KEY_ALIAS` | e.g. `kuula` |
| `ANDROID_KEY_PASSWORD` | The key password you set in `keytool` |
| `ANDROID_STORE_PASSWORD` | The keystore password you set in `keytool` |

> **Keep the original `.keystore` file safe forever.** If you lose it,
> you can never update the app on Google Play — only publish a new one
> under a new package ID.

## Required for iOS signed IPA (workflow_dispatch → release)

Four secrets cover Apple code signing. All four come from your Apple
Developer account:

| Secret name | How to get it |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer → Membership → Team ID (10 chars) |
| `APPLE_CERT_BASE64` | `base64 -w0 distribution.cer` — your Distribution Certificate (Developer → Certificates, IDs & Profiles → download `.cer`) |
| `APPLE_CERT_PASSWORD` | The `.p12` export password you set when exporting the certificate from Keychain Access |
| `APPLE_PROVISION_BASE64` | `base64 -w0 Kuula.mobileprovision` — your App Store provisioning profile |

To export the `.p12`:

1. Open **Keychain Access** on a Mac.
2. Find your **iPhone Distribution: Your Org (TEAMID)** certificate.
3. Right-click → **Export…** → save as `.p12` with a password.
4. `base64 -w0 exported.p12 | pbcopy` → paste as `APPLE_CERT_BASE64`.
5. Use the same password as `APPLE_CERT_PASSWORD`.

To get the provisioning profile:

1. Apple Developer → Profiles → **+** → **App Store**.
2. App ID: `ug.kuula.app`. Certificate: your distribution cert.
3. Download → `base64 -w0 Kuula.mobileprovision | pbcopy` → paste as `APPLE_PROVISION_BASE64`.

## Backend auto-deploy (triggered on `v*` tag push)

The `deploy-backend.yml` workflow builds a Docker image, pushes it to GHCR,
then SSHes onto your production server to pull + restart. Set these four
secrets — full server setup steps live in `deploy/SERVER_SETUP.md`.

| Secret name | Purpose | Example |
|---|---|---|
| `DEPLOY_SSH_KEY` | SSH **private** key for the `kuula-deploy` user on the server | (contents of the `kuula-ci-deploy` file you generate locally) |
| `DEPLOY_HOST` | Server IP or hostname | `api.kuula.ug` or `203.0.113.42` |
| `DEPLOY_USER` | SSH username (created during server bootstrap) | `kuula-deploy` |
| `PUBLIC_API_URL` | Public HTTPS URL used for the post-deploy health check | `https://api.kuula.ug` |

> **Optional but recommended:** create a `production` environment in repo
> settings with "Required reviewers" = yourself. Every deploy then waits
> for your manual approval, so a bad tag can't ship without your sign-off.

## How to trigger a release build

1. Push the version bump commit to `main` (version in `package.json`,
   `capacitor.config.ts` if changed, `android/app/build.gradle`
   `versionCode`/`versionName`, and iOS `Info.plist`
   `CFBundleShortVersionString`).
2. To deploy the backend: `git tag v2.4.2 && git push origin v2.4.2` —
   the `Deploy Backend` workflow auto-triggers, builds the image, and
   ships to production.
3. To build mobile apps: go to **Actions → Build Mobile Apps → Run workflow**,
   pick the version, platforms (`android,ios`), and `release` build type.
4. After ~20 minutes, download the signed artifacts from the run page.

## Verifying secrets are set

```bash
gh secret list -R jolems123/KuulaMobile
```
