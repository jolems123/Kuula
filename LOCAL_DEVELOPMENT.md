# Kuula local development

## Start Kuula on Windows

The repository includes a self-verifying Windows launcher.

### Fastest option

Double-click:

```text
RUN_KUULA_LOCAL.bat
```

Or from PowerShell in the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\RUN_KUULA_LOCAL.ps1
```

The launcher will:

1. require Node.js/npm and Docker Desktop;
2. start PostgreSQL 16 on local port `5433`;
3. install frontend and API dependencies;
4. generate Prisma Client;
5. apply every committed Prisma migration;
6. seed the isolated customer/admin catalog plus Level 1 and Level 2 staff;
7. seed local-only provider limits and fake verified partner destinations;
8. compile the Node API;
9. typecheck and build the React app;
10. start the API on `http://localhost:3000`;
11. start Vite on `http://127.0.0.1:5173`;
12. run an authenticated smoke test before reporting success.

The launcher prints `KUULA IS RUNNING LOCALLY — SMOKE TEST PASSED` only after those checks succeed.

## Safety

The local launcher explicitly sets:

```text
REAL_MONEY_ENABLED=false
```

No MarZPay credentials are supplied. Local partner destination numbers are fake development records only. They are useful for verifying the three-stage and direct-payee user experience but cannot send real money.

Local OTP is also explicitly restricted to non-production development mode. The local OTP is `246810`; it is not logged by the API and cannot be activated in production through the local-development switches.

## Local URLs

```text
Customer app: http://127.0.0.1:5173
API health:   http://localhost:3000/api/health
PostgreSQL:   localhost:5433
Database:     kuula_local
```

## Customer demo

```text
Phone:    +256700000000
Password: 12345678
```

## Credit operations staff

All staff use MFA code `246810` in the local-only environment.

### Level 1 — Field/Credit Officer

```text
Email:    officer-local@kuula.test
Password: LocalOfficerPassword2026!
```

### Level 2 — Senior Credit Reviewer

```text
Email:    manager-local@kuula.test
Password: LocalManagerPassword2026!
```

### Level 3 — Final Credit Authority/Admin

```text
Email:    admin-local@kuula.test
Password: LocalAdminPassword2026!
```

Partner verification workspace:

```text
http://127.0.0.1:5173/#/admin-partner-financing
```

## Local-only fake verified partner destinations

These records exist only so staff can exercise invoice/payee verification. Real-money movement remains disabled.

```text
MTN:    +256700000010
Airtel: +256700000011
```

## Run the smoke test again

With Kuula already running:

```powershell
powershell -ExecutionPolicy Bypass -File .\TEST_KUULA_LOCAL.ps1
```

The smoke test verifies:

- API health and that real money is disabled;
- frontend reachability;
- customer login/session;
- Uganda market, product and partner catalog;
- admin password + MFA flow;
- credit operations dashboard;
- available Level 1 field officer;
- available Level 2 senior reviewer;
- partner-financing verification API.

## Stop Kuula

```powershell
powershell -ExecutionPolicy Bypass -File .\STOP_KUULA_LOCAL.ps1
```

This stops the API, frontend and PostgreSQL container while preserving local database data.

To destroy the local database volume too:

```powershell
docker compose -f deploy/docker-compose.local.yml down -v
```

## Important production boundary

Local success is not production authorization. Production requires real provider credentials, verified production provider/destination limits, production SMS/KYC storage configuration, valid HTTPS URLs and successful release checks. Development seed scripts refuse to run in `NODE_ENV=production`.
