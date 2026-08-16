# LEGACY — DO NOT DEPLOY

The `supabase/` directory is retained only as historical migration/reference material from an earlier Kuula architecture.

It is **not** the production backend and must not be deployed, pushed, linked to a production project, or used for current security assumptions.

Current production architecture:

```text
React / Capacitor
      |
      v
Railway HTTPS
      |
      v
Node.js / Express API
      |
      v
Prisma
      |
      v
Railway PostgreSQL
```

Money movement, authentication, KYC, credit decisions, partner financing, audit logs and repayment state are controlled by the Node/Express API under `server/`.

Production Railway configuration is defined at repository root in:

- `railway.json` — API service
- `Dockerfile.railway` — API image
- `railway.web.json` — web service
- `Dockerfile.web` — web image

The old Supabase migrations/functions include obsolete wallet/savings and earlier security models. They must never be applied to the current Railway PostgreSQL database.

There are intentionally no active CI/deployment workflows for this directory.
