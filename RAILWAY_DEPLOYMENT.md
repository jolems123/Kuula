# Kuula — Railway Production Deployment

This repository deploys Kuula as two Railway services plus Railway PostgreSQL:

```text
Kuula Web (Railway HTTPS)
          |
          v
Kuula API (Railway HTTPS)
          |
          v
Railway PostgreSQL

External services:
- Africa's Talking — OTP/SMS
- Smile ID — identity verification when configured
- MarZPay — MTN/Airtel collections and disbursements
- Private S3-compatible object storage — KYC and field evidence
```

The legacy `supabase/` tree is reference-only and must not be deployed.

## 1. Create Railway PostgreSQL

Add a PostgreSQL service to the Railway project. Do not expose the database publicly unless an explicit operational need exists.

The API service variable should reference Railway PostgreSQL's managed URL:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Adjust the Railway service name in the reference if the database service is not named `Postgres`.

## 2. Create the Kuula API service

Connect this GitHub repository to a Railway service.

Use the repository root and the default config file:

```text
/railway.json
```

The config builds `Dockerfile.railway`, runs:

```text
npx prisma migrate deploy
```

as a pre-deploy command, then requires:

```text
GET /api/ready
```

to return HTTP 200 before Railway switches traffic to the new deployment.

### Required API variables

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}

JWT_SECRET=<64+ character cryptographically random value>
OTP_PEPPER=<separate 32+ character cryptographically random value>

SMS_PROVIDER=africastalking
AFRICASTALKING_USERNAME=<production username>
AFRICASTALKING_API_KEY=<production secret>

CORS_ORIGINS=https://<kuula-web-domain>
TRUST_PROXY_HOPS=1

KYC_STORAGE_PROVIDER=s3
KYC_S3_BUCKET=<private bucket>
KYC_S3_REGION=<region>
KYC_S3_ACCESS_KEY_ID=<secret if workload identity is unavailable>
KYC_S3_SECRET_ACCESS_KEY=<secret if workload identity is unavailable>
KYC_S3_ENDPOINT=<only when using a non-AWS S3-compatible provider>
KYC_S3_FORCE_PATH_STYLE=false
KYC_S3_KMS_KEY_ID=<optional KMS key>

REAL_MONEY_ENABLED=false
PUBLIC_API_URL=https://<kuula-api-domain>
MARZPAY_API_KEY=<provider secret when configuring payments>
MARZPAY_API_SECRET=<provider secret when configuring payments>

SMILE_PARTNER_ID=<optional>
SMILE_API_KEY=<optional>
SMILE_ENV=production
```

Production startup deliberately fails when local/test OTP configuration is enabled. Never define:

```text
TEST_OTP_CODE
ALLOW_LOCAL_DEV_OTP=true
MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN=true
```

No secret may be stored in a `VITE_*` variable.

## 3. Generate the API public domain

Generate a Railway domain or attach the production custom API domain. Set:

```text
PUBLIC_API_URL=https://<that-domain>
```

Kuula requires a public HTTPS URL before real-money movement may be enabled.

The MarZPay callback URL is:

```text
https://<api-domain>/api/payments/marzpay/webhook
```

Kuula does not settle money solely from the inbound callback. For every final callback it performs an authenticated server-to-server MarZPay transaction lookup and verifies provider UUID, Kuula reference, amount and final state before changing the ledger, repayment or loan status.

## 4. Create the Kuula Web service

Create a second Railway service from the same repository.

Set its custom Railway config file to:

```text
/railway.web.json
```

This builds `Dockerfile.web` and serves the generated `dist/` using the repository's hardened static server.

### Web build variables

```text
VITE_USE_API=true
VITE_BACKEND=node
VITE_APP_ENV=production
VITE_REVIEWER_MODE=false
VITE_API_BASE_URL=https://<kuula-api-domain>
VITE_APP_VERSION=<release version>
```

Do not put API credentials, JWT secrets, database URLs, SMS keys, payment keys, S3 keys or service-role keys in any `VITE_*` variable. Vite variables are public client code.

The web health check is:

```text
GET /health
```

The static server sends CSP, HSTS, clickjacking, MIME-sniffing, referrer and permissions headers.

## 5. Update API CORS after web domain exists

After Railway creates the Kuula web domain, set the API service:

```text
CORS_ORIGINS=https://<kuula-web-domain>
```

Production refuses non-HTTPS CORS origins.

## 6. First deployment — money must remain OFF

Keep:

```text
REAL_MONEY_ENABLED=false
```

The first Railway production deployment should validate infrastructure and application behavior without sending or collecting real money.

Verify:

1. `/api/health` returns 200.
2. `/api/ready` returns 200 and reports database ready.
3. Web `/health` returns 200.
4. Customer signup/login/OTP works through Africa's Talking.
5. Admin MFA works.
6. KYC uploads remain private and signed access expires.
7. Level 1 → Level 2 → Level 3 credit workflow is assignment-scoped.
8. Officer accounts cannot access global KYC review or unrelated credit files.
9. Partner payout requires separate destination onboarding, payee verification and final approval actors.
10. Account closure is blocked while a financial obligation is open.

## 7. Payment-provider setup before real money

Before changing `REAL_MONEY_ENABLED` to true:

- configure valid MTN/Airtel provider limits in `payment_provider_limits` through the authorized Kuula admin controls;
- verify customer/partner destination profiles where applicable;
- verify MarZPay production credentials;
- verify `PUBLIC_API_URL` points to the Railway/custom HTTPS API domain;
- test callback reachability;
- test the authenticated MarZPay transaction-details lookup;
- verify reconciliation operations and audit events;
- test duplicate callbacks, wrong UUID, wrong reference and wrong amount;
- test partial multi-leg disbursement and failed later legs;
- confirm the repayment schedule reflects the amount actually settled;
- verify only one disbursement leg can be in flight;
- confirm Railway PostgreSQL backups/restore procedures are configured operationally.

Only after those checks should:

```text
REAL_MONEY_ENABLED=true
```

be set.

## 8. Partner/direct-payee separation of duties

Restricted-purpose credit must never fall through to the customer's Mobile Money wallet.

Production requires three independent actions:

1. treasury/admin onboards the verified settlement destination;
2. a different authorized credit reviewer verifies the invoice/payee against that destination;
3. a third staff member performs final offer approval.

The application rejects reuse of either earlier actor as final approver.

## 9. Deployments and migrations

Railway is the only production backend deployment path in this repository.

`railway.json` runs Prisma migrations as a pre-deploy step. A migration failure prevents the new release from becoming active.

Do not run `prisma db push` in production. Production schema changes must be committed Prisma migrations and applied with:

```text
prisma migrate deploy
```

Do not run demo/local seeds against production.

## 10. Rollback discipline

If the API readiness check fails, Railway should keep the prior healthy deployment serving traffic. Database migrations must therefore remain backward-compatible with the immediately previous release whenever possible.

For any real-money incident:

1. set `REAL_MONEY_ENABLED=false` immediately;
2. do not alter provider transaction state manually;
3. use the reconciliation queue and provider transaction lookup;
4. preserve audit logs and provider references;
5. reconcile settled principal before re-enabling payment traffic.

## 11. Release gates

Do not enable public real-money lending unless all of the following are true:

- frontend typecheck/test/build passes;
- server TypeScript build/tests pass;
- all Prisma migrations apply to a clean PostgreSQL 16 database;
- provider callback verification tests pass;
- authentication/security tests pass;
- Railway API/web health checks pass;
- production environment contains no local/demo credentials;
- security scan has no unresolved critical/high launch blocker;
- payment reconciliation and partial-disbursement scenarios have been exercised.
