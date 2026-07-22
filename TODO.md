# Production Hardening & Release Readiness TODO

## 0) Audit Baseline (Completed)
- [x] Read core backend entrypoint and middleware
- [x] Read Prisma schema and role model
- [x] Read all major API routes
- [x] Read frontend API client integration
- [x] Identify critical auth/security/data-access risks

## 1) Backend Security Foundation
- [x] Remove insecure JWT secret fallback and enforce required secret
- [x] Expand JWT role typing and normalize role checks
- [x] Add secure HTTP headers (`helmet`)
- [x] Add constrained CORS policy via env allowlist
- [x] Add request rate limiting for auth and API
- [x] Harden JSON body limits and request parsing
- [ ] Ensure consistent, safe error responses (no sensitive leakage)

## 2) Authorization & Data Isolation
- [x] Add reusable role guard middleware (admin/manager/officer/customer/user)
- [ ] Enforce ownership checks on all user resources
- [ ] Prevent cross-account reads/writes via ID/URL tampering
- [ ] Verify admin-only endpoints are protected centrally
- [ ] Ensure deleted users cannot continue normal access

## 3) Route/Database Stability Fixes
- [ ] Fix Prisma `update/delete` patterns that misuse non-unique `where`
- [ ] Add input validation for route payloads (amounts, IDs, enums, notes)
- [ ] Wrap money/state-changing operations in transactions where needed
- [ ] Normalize numeric conversions for BigInt-backed fields
- [ ] Add deterministic not-found and conflict handling

## 4) Approval Workflow Integrity
- [ ] Validate loan status transition rules
- [ ] Ensure decision endpoints guard current state
- [ ] Add/verify approval/rejection notes handling
- [ ] Ensure UI-consumed status labels and backend states are consistent
- [ ] Add/verify audit trail entries for decisions and updates

## 5) Frontend/API Contract Alignment
- [ ] Reconcile client endpoints with implemented server routes
- [ ] Fix failed API call paths and payload mismatches
- [ ] Add robust loading/error/success states in critical flows
- [ ] Remove placeholder/fake/unfinished integration points
- [ ] Ensure token handling is safe and consistent

## 6) UI Professionalism & Responsiveness
- [ ] Remove duplicate/inconsistent UI patterns
- [ ] Improve forms/tables/cards/buttons/empty/loading/error states
- [ ] Tighten spacing/typography consistency to existing brand
- [ ] Validate mobile/tablet/desktop behavior on core screens
- [ ] Keep current brand identity; avoid unnecessary redesign

## 7) Play Store / App Store Readiness
- [ ] Privacy policy link present and accessible
- [ ] Terms & conditions link present and accessible
- [ ] Account deletion process discoverable and functional
- [ ] Permission rationale screens/messages verified
- [ ] No exposed API keys/secrets in frontend bundle
- [ ] Icons/splash assets validated for Android/iOS
- [ ] Production env configuration documented and validated
- [ ] Error reporting/release checks documented

## 8) Verification & Build Gates
- [ ] Run backend typecheck
- [ ] Run frontend typecheck
- [ ] Run lint (backend + frontend)
- [ ] Run tests (existing suites)
- [ ] Run production builds (backend/frontend/mobile if configured)
- [ ] Fix all surfaced errors

## 9) Final Delivery Report
- [ ] Bugs fixed summary
- [ ] Files changed list
- [ ] Security improvements summary
- [ ] Approval workflows tested summary
- [ ] Role-access tests completed summary
- [ ] UI improvements summary
- [ ] Remaining risks
- [ ] Run/build commands
- [ ] Google Play readiness checklist
- [ ] Apple App Store readiness checklist
