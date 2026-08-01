# Kuula Deployment Guide

## Production architecture

Kuula uses one backend path:

```text
React / Capacitor application
            |
            | HTTPS JSON API
            v
Node.js / Express server
            |
            | Prisma
            v
PostgreSQL database
            |
            v
pgAdmin 4 for database administration
```

**pgAdmin 4 is an administration interface, not the application backend.** The
backend is the Node/Express API in `server/`; PostgreSQL stores the data and
pgAdmin is used to inspect and manage that PostgreSQL database.

The `supabase/` directory is retained only as legacy reference during the
migration. It is not part of the production build or deployment.

---

## 1. Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer
- pgAdmin 4
- A Linux server or managed application host for the Node API
- HTTPS domain for the API, for example `https://api.kuula.ug`
- Android Studio for local Android builds
- Xcode on macOS for local iOS builds

---

## 2. Install the application

```bash
git clone https://github.com/jolems123/Kuula.git
cd Kuula
npm ci --legacy-peer-deps
cd server
npm install
cd ..
```

The frontend and API intentionally have separate dependency manifests. This
prevents the API deployment from depending on frontend-only packages.

---

## 3. Create the PostgreSQL database

In pgAdmin 4:

1. Connect to your PostgreSQL server.
2. Create a login role named `kuula_user` with a strong unique password.
3. Create a database named `kuula_db` owned by `kuula_user`.
4. Do not use the PostgreSQL superuser for the running application.
5. Restrict remote database access to the API server only.

Example development connection string:

```env
DATABASE_URL="postgresql://kuula_user:<PASSWORD>@localhost:5432/kuula_db?schema=public"
```

For production, use the private hostname supplied by the database host. Keep the
connection string only in the API server's secret environment variables.

---

## 4. Configure the Node API

Create `server/.env` from `server/.env.example` and set at least:

```env
DATABASE_URL="postgresql://kuula_user:<PASSWORD>@<PRIVATE_DB_HOST>:5432/kuula_db?schema=public"
JWT_SECRET="<64-or-more-random-characters>"
PORT=3000
CORS_ORIGINS="https://app.kuula.ug"

ADMIN_EMAIL="<initial-admin-email>"
ADMIN_PASSWORD="<strong-one-time-seed-password>"

SMILE_PARTNER_ID=""
SMILE_API_KEY=""
SMILE_ENV="sandbox"
KYC_STORAGE_DIR="/var/lib/kuula/kyc"
```

Generate a JWT secret with:

```bash
openssl rand -hex 64
```

Never place `DATABASE_URL`, `JWT_SECRET`, SMS credentials, KYC credentials, or
mobile-money credentials in a `VITE_*` variable. Every `VITE_*` value is public
inside the application bundle.

---

## 5. Apply database migrations

From the repository root:

```bash
cd server
npx prisma generate
npm run db:migrate:deploy
cd ..
```

For a new local development database, use:

```bash
cd server
npm run db:migrate
```

Use `prisma migrate deploy` in production. Do not use `prisma db push` against a
live financial database because it does not provide the same migration history
and deployment control.

---

## 6. Start the API

Build and start the server:

```bash
cd server
npm run build
npm start
```

The health endpoint is:

```text
GET https://api.kuula.ug/api/health
```

Run the API behind an HTTPS reverse proxy or a managed host that terminates TLS.
The public application must never connect directly to PostgreSQL.

Production process managers must restart the API after crashes and preserve API
logs. Set the deployment health check to `/api/health`.

---

## 7. Configure the frontend

Create `.env.local` for local development:

```env
VITE_BACKEND=node
VITE_USE_API=true
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT_MS=10000
VITE_APP_ENV=development
VITE_APP_VERSION=2.4.1
VITE_ENABLE_BIOMETRIC=true
VITE_ENABLE_SAVINGS=true
VITE_REVIEWER_MODE=false
```

Production builds must use an HTTPS API URL:

```env
VITE_BACKEND=node
VITE_USE_API=true
VITE_API_BASE_URL=https://api.kuula.ug
VITE_APP_ENV=production
VITE_APP_VERSION=2.4.1
VITE_ENABLE_BIOMETRIC=true
VITE_ENABLE_SAVINGS=true
VITE_REVIEWER_MODE=false
```

`npm run build` executes an environment guard before Vite. A production build
fails when the backend is not `node`, the API URL is missing, the URL is local,
or HTTPS is not used.

---

## 8. GitHub Actions configuration

In **Repository settings → Secrets and variables → Actions**, add:

| Secret | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Public HTTPS URL of the deployed Node API |
| `ANDROID_KEYSTORE_BASE64` | Android release keystore, base64 encoded |
| `ANDROID_KEY_ALIAS` | Android signing alias |
| `ANDROID_KEY_PASSWORD` | Android key password |
| `ANDROID_STORE_PASSWORD` | Android keystore password |
| `APPLE_TEAM_ID` | Apple developer team ID |
| `APPLE_CERT_BASE64` | Distribution certificate |
| `APPLE_CERT_PASSWORD` | Certificate password |
| `APPLE_PROVISION_BASE64` | Provisioning profile |

Do not add database or server secrets to GitHub variables prefixed with `VITE_`.
Database credentials belong in the API hosting environment, not the mobile build.

The CI workflow now verifies:

1. Frontend dependency installation
2. Server dependency installation
3. Prisma client generation
4. Frontend TypeScript
5. Frontend unit tests
6. Pricing compliance tests
7. Server TypeScript build
8. The guarded production web build

---

## 9. Build the mobile apps

Build the verified web bundle and sync it to Capacitor:

```bash
npm run build
npx cap sync
```

Android development:

```bash
npm run cap:android
```

Android release bundle:

```bash
cd android
./gradlew bundleRelease
```

The output is normally under:

```text
android/app/build/outputs/bundle/release/
```

For iOS:

```bash
npm run cap:ios
```

Archive and sign the application in Xcode.

---

## 10. Safe deployment order

Deploy in this order:

1. Back up the PostgreSQL database.
2. Apply reviewed Prisma migrations.
3. Deploy and health-check the Node API.
4. Test authentication and required API routes against staging.
5. Build the frontend with the production API URL.
6. Test the Android/iOS build on real devices.
7. Release through controlled internal testing before production rollout.

Do not release a mobile build until the API health check and end-to-end staging
tests pass.

---

## 11. Current financial-operation restriction

The present Node routes still require separate remediation for real mobile-money
disbursement, repayment, and savings settlement. Until those controls are fixed
and tested, use this deployment only for development and sandbox operation—not
for live customer funds.
