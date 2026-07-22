# Migration: Supabase → Local PostgreSQL

## Completed Steps
- [x] Phase 1 Audit
- [x] Create backup branch (migrate-supabase-to-postgres)

## Phase 2 Implementation
- [x] Install server dependencies (Express, Prisma, bcrypt, jsonwebtoken, cors, dotenv)
- [x] Create Prisma schema matching current DB structure
- [x] Build Express server entry point (`server/src/index.ts`)
- [x] Build auth routes (register, login, OTP verification, password reset)
- [x] Build loan routes (applications, quotes, decisions, top-up)
- [x] Build savings routes (balance, deposit, withdraw)
- [x] Build message routes (get, post)
- [x] Build transaction routes
- [x] Build notification routes
- [x] Build goals routes
- [x] Build admin routes (stats, customers, savings overview, investor report)
- [x] Build credit score endpoint
- [x] Build compliance endpoint
- [x] Build health endpoint
- [x] Build JWT middleware
- [x] Build error handling middleware
- [x] Build pricing module (mirror from src/app/lib/pricing.ts)
- [x] Create seed script for admin user
- [x] Update `.env.example` with DATABASE_URL
- [x] Create `.env` file (gitignored)
- [x] Update frontend env config (`src/app/config/env.ts`)
- [x] Update frontend API client (`src/app/api/client.ts`) to default to local backend
- [x] Update App.tsx session bootstrap
- [x] Update `useRealtimeSubscriptions.ts` with polling fallback
- [x] Update `scripts/check-env.mjs` for local backend

## Phase 3 - Run Migrations
- [ ] Run Prisma generate
- [ ] Run Prisma migrate dev
- [ ] Run seed script
- [ ] Run typecheck
- [ ] Run lint
- [ ] Run tests

## Phase 4 - Test
- [ ] Start backend server
- [ ] Start frontend dev server
- [ ] Test registration
- [ ] Test login
- [ ] Test loan applications
- [ ] Test admin functions
- [ ] Test savings/wallet
- [ ] Test all endpoints

## Phase 5 - Document
- [ ] Files changed summary
- [ ] Commands executed
- [ ] Environment variables needed
- [ ] Rollback instructions

