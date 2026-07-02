# Kuula Backend — Production API

Node.js + Express + Postgres + TypeScript backend for the Kuula Mobile app.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20+ (ESM) | LTS, native fetch, built-in crypto |
| Web framework | Express 4 | Stable, huge ecosystem, simple mental model |
| Database | Postgres 16 | ACID, JSONB, CITEXT, full-text search, the right choice for fintech |
| DB driver | `pg` (node-postgres) | Standard, well-maintained, supports `FOR UPDATE` row locks |
| Migrations | `node-pg-migrate` (SQL files) | SQL-first, no ORM magic, reviewable diffs |
| Auth | JWT (access 15min + refresh 30d) + argon2id | OWASP-recommended hash, stateless tokens |
| Validation | `zod` | Inference + parse + error formatting in one shot |
| Logging | `pino` + `pino-http` | Fastest JSON logger in the Node ecosystem |
| Security | `helmet`, `cors`, `express-rate-limit`, `express-slow-down` | Standard mitigation stack |
| Money | All values stored as BIGINT cents (UGX has no fractional unit) | Exact arithmetic, no float drift |

## Quick start

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET to something long and random:
#   openssl rand -base64 48

docker compose up -d           # boots Postgres + API, runs migrations, starts server on :3000
docker compose logs -f api     # tail logs
docker compose exec api npm run seed   # seed demo admin + customer
docker compose down            # stop (data persists in volume)
docker compose down -v         # stop + wipe data
```

### Option B — Local Node + Postgres

```bash
# 1. Start Postgres 16 (via Docker or your OS package manager)
docker run -d --name kuula-pg -p 5432:5432 \
  -e POSTGRES_USER=kuula -e POSTGRES_PASSWORD=kuula -e POSTGRES_DB=kuula \
  postgres:16-alpine

# 2. Configure env
cp .env.example .env
# Set DATABASE_URL=postgres://kuula:kuula@localhost:5432/kuula

# 3. Install + run
npm install
npm run dev            # tsx watch — hot reload on file changes
# In another terminal:
npm run seed           # seed admin + customer demo accounts
```

## Demo credentials (after `npm run seed`)

| Role | Identifier | Secret |
|---|---|---|
| Customer | `+256 770 123 456` | PIN `1234` |
| Admin | `admin@kuula.ug` | `kuula-admin-2026` |

## API surface

### Public
- `GET  /api/health` — health check
- `GET  /api/compliance` — APR cap, min term, savings rate (drives in-app disclosures)
- `GET  /api/loans/rules` — loan rules (amount range, terms, purposes, methods)

### Auth (rate-limited to 10 req / 15 min per IP)
- `POST /api/auth/signup` — `{ name, phone, email, password, nationalId }` → 201
- `POST /api/auth/login` — `{ phone, pin }` → `SessionPayload`
- `POST /api/auth/admin-login` — `{ email, password }` → `SessionPayload`
- `POST /api/auth/verify-otp` — `{ code }` (Bearer access token from signup) → `{ ok }`
- `POST /api/auth/reset-password` — `{ email }` → `{ ok }` (always 200, no enumeration)
- `POST /api/auth/refresh` — `{ refreshToken }` → new `SessionPayload`
- `POST /api/auth/logout` — revokes all refresh tokens
- `GET  /api/auth/me` — current session

### User (Bearer required)
- `GET    /api/users/me`
- `PATCH  /api/users/me` — update profile
- `POST   /api/users/me/delete` — soft delete (account-deletion flow)

### Credit (Bearer required)
- `GET  /api/credit/score` — live 300–850 score with 5-factor breakdown
- `POST /api/credit/calculate` — 0–100 eligibility score (admin can pass `user_id`)

### Savings (Bearer required)
- `GET   /api/savings` — balance + accrued interest + APR
- `POST  /api/savings/deposit` — `{ amount }` → `{ balance }`
- `POST  /api/savings/withdraw` — `{ amount }` → `{ balance }`
- `GET   /api/savings/goals`
- `POST  /api/savings/goals` — `{ name, target, deadline?, emoji? }`

### Wallet (Bearer required)
- `GET  /api/wallet` — `{ balance }`
- `POST /api/wallet/topup` — `{ amount }` → `{ balance }`

### Loans (Bearer required)
- `POST /api/loans/quote` — `{ amount, termDays }` → live pricing (APR-capped)
- `GET  /api/loans/rules`
- `GET  /api/loans/applications` — list (admin: all, user: own)
- `POST /api/loans/applications` — `{ amount, purpose, termDays, channel }` → 201
- `POST /api/loans/applications/decision` — admin: `{ id, decision, notes }`
- `POST /api/loans/apply` — `{ amount, term_days, purpose, disbursement_method }` (auto-approve + disburse)
- `GET  /api/loans/repayment` — current repayment + collection stage
- `POST /api/loans/repayment/pay` — attempt auto-pay from wallet
- `POST /api/loans/collections/schedule` — record intent (sweep executes)

### Messages (Bearer required)
- `GET  /api/messages` — support thread (admin: all, user: own)
- `POST /api/messages` — `{ content, receiverId? }` (customer → admin; admin → user)
- `POST /api/messages/read` — mark all my received messages read

### Notifications (Bearer required)
- `GET  /api/notifications`
- `POST /api/notifications/read` — mark all read
- `POST /api/notifications/read/:id`

### Transactions (Bearer required)
- `GET /api/transactions` — ledger (admin: all, user: own)

### Disbursements (Bearer admin required)
- `POST /api/mtn/disburse` — `{ phoneNumber, amount, reference }`
- `POST /api/airtel/disburse`
- `POST /api/mtn/collection` — `{ phoneNumber, amount, transactionId }`
- `POST /api/airtel/collection`

### Admin (Bearer admin required)
- `GET /api/admin/stats` — dashboard stats
- `GET /api/admin/customers` — paginated customer list
- `GET /api/admin/customers/:id` — customer detail with loans + transactions

## Wire contract

The frontend (`src/app/api/types.ts`) defines the wire shapes. The backend's
`src/lib/types.ts` mirrors them exactly. `SessionPayload` from `/api/auth/login`
or `/api/auth/me` returns everything the app needs to render the dashboard:
token, refresh token, role, user, credit, loan, savings balance, messages, and
unread-notification count — in a single round trip.

## Compliance (audited for Apple + Google)

| Rule | Value | Source |
|---|---|---|
| Max APR (all-in, including fees) | 33.6% | `COMPLIANCE_MAX_APR` env |
| Apple App Store APR cap | 36% (we stay under) | `COMPLIANCE_APPLE_CAP` env |
| Min loan term | 90 days | `COMPLIANCE_MIN_TERM_DAYS` env |
| Google Play min term | 61 days (we are above) | `COMPLIANCE_GOOGLE_MIN_TERM_DAYS` env |
| Interest type | SIMPLE (never compounded) | `core.ts priceLoan` / `priceLoanV2` |
| Savings interest rate | 5% p.a. | `COMPLIANCE_SAVINGS_APR` env |
| Savings discount on loans | -5% APR for ≥ UGX 100k saved | `COMPLIANCE_SAVINGS_DISCOUNT` env |

The pricing engine **asserts** the all-in APR never exceeds the Apple cap and
throws if it would. This makes non-compliant pricing impossible to ship.

## Security

- Passwords + PINs + OTP codes are argon2id-hashed (memory-hard).
- JWT access tokens (15min TTL) + refresh tokens (30d, rotated on each use,
  stored hashed in DB, revoked on logout).
- Helmet headers (HSTS, X-Frame-Options, etc.).
- CORS allowlist (no `*` in production).
- Per-IP rate limiting on `/api/*` (300 req / 15min) and `/api/auth/*`
  (10 req / 15min) with progressive slow-down after 5 attempts.
- Soft delete for account-deletion compliance (GDPR / Apple requirement).
- Audit log on every admin action (append-only table).

## Mobile-money providers

| Provider | Mode when unconfigured | Real API |
|---|---|---|
| MTN MoMo | Simulated success | `momodeveloper.mtn.com` (OAuth2 + X-Reference-Id) |
| Airtel Money | Simulated success | `openapi.airtel.africa` (OAuth2 client-credentials) |

Both providers retry 3× with exponential backoff. Tokens are cached in-memory
for 55 minutes. Set the env vars (`MTN_API_USER`, `MTN_API_KEY`,
`MTN_SUBSCRIPTION_KEY`, `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`) to switch
from simulation to live.

## Background jobs

- **Collections sweep** — runs hourly. For every due unpaid loan, attempts an
  auto-debit from the user's wallet, marks the loan paid or overdue, writes a
  ledger entry. Can be triggered manually by an admin via
  `POST /api/loans/collections/run`.

## Testing

```bash
# Requires a running Postgres. Tests DROP + recreate the test DB on each run.
DATABASE_URL=postgres://kuula:kuula@localhost:5432/kuula_test npm test
```

Tests cover: auth flow (signup, login, refresh, logout, me), loan flow (quote,
apply, decision, repayment), savings flow (deposit, withdraw, balance).

## Deployment

### Production checklist

1. **Set all env vars** in `.env` — most critically:
   - `JWT_SECRET` = `openssl rand -base64 48`
   - `DATABASE_URL` = your managed Postgres URL (RDS, Cloud SQL, Neon, etc.)
   - `CORS_ORIGIN` = your web app origin(s) only (no `*`)
   - `DEBUG_OTP` = `false`
   - `AUTO_MIGRATE` = `false` (run `npm run migrate` explicitly in your CI/CD)
   - `NODE_ENV` = `production`
   - Provider keys: `MTN_API_USER`, `MTN_API_KEY`, `MTN_SUBSCRIPTION_KEY`,
     `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AT_API_KEY`

2. **Run migrations explicitly**:
   ```bash
   npm run migrate
   npm run seed   # only the first time, to create the first admin
   ```

3. **Deploy** the Docker image:
   ```bash
   docker build -t kuula-api .
   docker run -d --name kuula-api -p 3000:3000 --env-file .env --restart unless-stopped kuula-api
   ```

4. **Put behind TLS** — Caddy, Nginx, or your cloud's managed TLS load balancer.
   The API is HTTPS-only in production; HTTP is for local dev only.

5. **Frontend wiring** — set the following in the React app's `.env`:
   ```
   VITE_API_BASE_URL=https://api.kuula.ug
   VITE_USE_API=true
   VITE_BACKEND=node
   ```

### Multi-instance notes

- Postgres is the source of truth; the API is stateless and horizontally
  scalable behind a load balancer.
- Rate-limiting defaults to in-memory. For multi-instance, swap
  `express-rate-limit`'s `store` for `rate-limit-redis` and pass a Redis client.
- The collections sweep runs on every instance — that's fine because the work
  is guarded by `SELECT ... FOR UPDATE` inside a transaction, so duplicate
  attempts resolve to one winner.

## Project layout

```
backend/
  package.json
  tsconfig.json
  Dockerfile
  docker-compose.yml
  .env.example
  src/
    index.ts                  # boot: migrations → express → graceful shutdown
    app.ts                    # Express app + middleware wiring
    config.ts                 # typed env config (fail-fast on missing)
    db/
      client.ts               # pg Pool singleton + tx() helper
      migrate.ts              # advisory-locked migration runner
      migrations/
        0001_init.sql         # full schema (users, loans, savings, wallets, etc.)
    lib/
      core.ts                 # ported from server/core.mjs (pricing, scoring, eligibility)
      crypto.ts               # argon2id wrappers
      tokens.ts               # JWT sign/verify (access + refresh)
      ids.ts                  # prefixed ID generators
      errors.ts               # ApiError class
      money.ts                # money helpers
      serialize.ts            # DB row → API shape
      types.ts                # wire types (mirror frontend)
    middleware/
      auth.ts                 # requireAuth, requireAdmin, requireRole
      error.ts                # asyncHandler + global error handler
      logger.ts               # pino logger
      rateLimit.ts            # general + auth + write limiters
      validate.ts             # zod schema validator
    modules/
      auth/auth.routes.ts
      users/users.routes.ts
      compliance/compliance.routes.ts
      credit/credit.routes.ts
      savings/savings.routes.ts
      wallet/wallet.routes.ts
      loans/loans.routes.ts
      messages/messages.routes.ts
      notifications/notifications.routes.ts
      transactions/transactions.routes.ts
      disbursements/disbursements.routes.ts
      admin/admin.routes.ts
    providers/
      mtn.ts                  # MTN MoMo Open API client
      airtel.ts               # Airtel Money Open API client
      otp.ts                  # SMS OTP (Africa's Talking + dev fallback)
    jobs/
      collections.ts          # hourly auto-collection sweep
    scripts/
      seed.ts                 # demo admin + customer
    tests/
      bootstrap.ts            # test DB setup
      seed-runner.ts          # programmatic seed
      auth.test.ts            # auth flow tests
      loans.test.ts           # loan flow tests
      savings.test.ts         # savings + wallet tests
```

## License

Proprietary — Kuula Mobile.
