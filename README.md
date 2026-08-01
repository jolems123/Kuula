<div align="center">

# Kuula

**The lending app for Ugandans the banks ignore.**

A mobile-first lending and savings platform being developed by Kuula
Microfinance Limited for Uganda and its partner applications.

</div>

---

## Current status

Kuula has a broad customer and operator interface, Android/iOS packaging,
PostgreSQL data models, Node/Express APIs, KYC submission, loan application
workflows, savings goals, reporting, and multilingual screens.

The repository is still under production hardening. **Do not use the current
build for live disbursement, repayment collection, or customer savings until the
real-money integrations and accounting controls are completed and tested.**

## Product direction

Kuula is intended to support:

- direct consumer and microenterprise loans;
- restricted-purpose financing for partner applications;
- healthcare financing initiated through TibaPay;
- agricultural input financing initiated through SiliFi;
- future property, logistics, and merchant-finance products;
- customer credit history and portfolio-management tools.

Partner financing requires additional API, payee, invoice, settlement, and
reconciliation work. Those workflows are not yet production-complete.

## Production architecture

```text
React / TypeScript / Capacitor application
                    |
                    | HTTPS JSON API
                    v
          Node.js / Express server
                    |
                    | Prisma ORM
                    v
             PostgreSQL database
                    |
                    v
       pgAdmin 4 administration tool
```

**pgAdmin 4 is used to administer PostgreSQL.** It is not the HTTP backend used
by the mobile application. The frontend communicates only with the Node API in
`server/`.

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Mobile | Capacitor for Android and iOS |
| API | Node.js and Express |
| Database | PostgreSQL |
| Database ORM | Prisma |
| Database administration | pgAdmin 4 |
| Authentication | Node API, bcrypt password hashes, signed JWTs |
| Internationalisation | English, Luganda, and Swahili |
| CI | GitHub Actions with frontend, server, PostgreSQL, and Capacitor checks |

The `supabase/` directory remains only as legacy implementation reference while
the migration is completed. It is not the selected production backend.

## Repository structure

```text
src/
  app/
    api/                    Node API client and shared response types
    components/screens/     Customer and operator screens
    config/                 Frontend environment validation
    context/                Session and application state
    lib/                    Pricing and application utilities
    screens/registry.ts     Screen registration and access routing
  i18n/locales/             English, Luganda, and Swahili translations
  styles/                   Application styles

server/
  prisma/                   PostgreSQL schema and migrations
  src/
    middleware/             Authentication and error handling
    routes/                 Auth, KYC, loans, savings, admin, and support APIs
    lib/                    Prisma, scoring, pricing, storage, and compliance

android/                    Capacitor Android project
ios/                        Capacitor iOS project
supabase/                   Legacy reference; not production runtime
```

## Local setup

### 1. Install frontend dependencies

```bash
npm ci --legacy-peer-deps
```

### 2. Install API dependencies

```bash
cd server
npm install
cd ..
```

### 3. Create PostgreSQL in pgAdmin 4

Create:

- login role: `kuula_user`;
- database: `kuula_db`;
- database owner: `kuula_user`.

Use a strong local password. Do not run the application as the PostgreSQL
superuser.

### 4. Configure the API

Copy `server/.env.example` to `server/.env` and set a local connection string:

```env
DATABASE_URL="postgresql://kuula_user:<PASSWORD>@localhost:5432/kuula_db?schema=public"
JWT_SECRET="replace-with-a-long-random-local-secret"
PORT=3000
CORS_ORIGINS="http://localhost:5000,http://localhost:5173"
```

Generate and migrate the database:

```bash
cd server
npx prisma generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API health check is available at:

```text
http://localhost:3000/api/health
```

### 5. Configure and run the frontend

Copy `.env.example` to `.env.local` and ensure it includes:

```env
VITE_BACKEND=node
VITE_USE_API=true
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_ENV=development
VITE_REVIEWER_MODE=false
```

Start the app:

```bash
npm run dev
```

## Demo interface mode

The interface can also run without the API for screen review and route testing.
Demo data must never be enabled in a production build.

```bash
VITE_USE_API=false npm run dev
```

Demo accounts shown by the interface use PIN `1234`. They are not PostgreSQL
accounts and must not be treated as real customers.

## Verification commands

Frontend:

```bash
npm run typecheck
npm test
npm run check:pricing
npm run build
```

Server:

```bash
cd server
npx prisma generate
npm run build
```

Full pull-request verification is defined in `.github/workflows/ci.yml`. It uses
an isolated PostgreSQL service, applies Prisma migrations, seeds test accounts,
starts the Node API, tests successful and unsuccessful login, builds the
frontend, sweeps registered screens, and syncs the native projects.

## Production configuration

A production frontend build requires:

```env
VITE_BACKEND=node
VITE_USE_API=true
VITE_API_BASE_URL=https://<public-api-domain>
VITE_APP_ENV=production
VITE_REVIEWER_MODE=false
```

The build fails when the backend is not Node, the API URL is missing, the API
uses HTTP instead of HTTPS, or the URL points to localhost.

See [DEPLOYMENT.md](DEPLOYMENT.md) for PostgreSQL, pgAdmin, Node API, GitHub
Actions, Android, and iOS deployment instructions.

## Security rules

- Never expose `DATABASE_URL`, `JWT_SECRET`, KYC credentials, SMS credentials,
  or payment-provider keys through variables beginning with `VITE_`.
- Never serve stored national-ID images from a public directory.
- Never mark a disbursement or repayment completed before confirmation from the
  payment provider.
- Never modify financial balances without a corresponding settled ledger entry.
- Never deploy demo accounts, reviewer bypasses, or development OTP logging to
  real customers.

## Planned hardening order

1. Establish Node/PostgreSQL as the single backend and correct CI.
2. Unify frontend and server loan pricing.
3. Replace simulated loan disbursement and repayment with provider-settled money movement.
4. Disable or replace simulated savings deposits and withdrawals.
5. Complete SMS OTP and password recovery.
6. Complete production KYC storage, review, and audit controls.
7. Add partner-financing APIs for TibaPay and SiliFi.
8. Add financial-ledger reconciliation, audit logging, and operational monitoring.

## License

Proprietary — © Kuula Microfinance Limited.
