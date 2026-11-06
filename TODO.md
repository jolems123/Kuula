# Kuula production closeout

This file tracks only work that is genuinely still outstanding. Completed implementation items were removed so it does not misrepresent launch readiness.

## Completed in code

- [x] Uganda NIN validation is enforced on account creation and KYC.
- [x] Phone verification and password reset use OTPs stored as keyed hashes.
- [ ] Staff email OTP MFA is implemented but requires verified delivery/recovery and `STAFF_EMAIL_MFA_REQUIRED=true` in production. Production flag was absent on 2026-11-06.
- [x] Access tokens are short-lived and refresh sessions rotate/revoke server-side.
- [x] KYC front/back document uploads are validated and stored server-side.
- [x] Production KYC storage requires S3 and uses server-side encryption; document access is short-lived/authenticated.
- [x] Smile ID Enhanced KYC integration is available behind environment configuration.
- [x] Real-money movement is gated by `REAL_MONEY_ENABLED`.
- [x] MarZPay callbacks require a shared webhook token and production real-money mode additionally requires timestamped HMAC signatures and replay protection.
- [x] Provider settlement/reconciliation journal controls are implemented.
- [x] Production environment validation rejects incomplete/unsafe configuration.
- [x] `/api/ready` verifies PostgreSQL connectivity and is the Railway/container readiness target.
- [x] Transaction API responses explicitly whitelist customer-safe fields.
- [x] Railway is the single production deployment authority; GitHub Actions no longer SSH-deploys a second production copy.
- [x] Android removes contacts, SMS, call-log and location permissions and blocks general cleartext traffic.
- [x] Officer/manager customer and credit-case reads are assignment-scoped; admin retains the global control plane.
- [x] Frontend staff navigation is role-aware so officers cannot browse treasury/system screens and managers cannot browse admin-only control-plane screens.
- [x] Legacy borrower role `user` is normalized to the canonical runtime role `customer`, while database compatibility is preserved during the transition.
- [x] Customer reporting accepts both `user` and `customer` persisted roles so no borrower disappears during a future controlled role migration.
- [x] Wallet/payment-method, refinance/credit-limit, promotion and unapproved autopay/repayment-plan deep links are removed from the live production journey through canonical redirects.
- [x] The remaining Supabase compatibility shim is dependency-free at runtime and cannot pull the Supabase client into the application bundle.

## Required before unrestricted public launch

The full, current checklist (prerequisites, sandbox scenarios, go-live, rollback and
the backup-restore drill) is in [docs/REAL_MONEY_ACTIVATION.md](docs/REAL_MONEY_ACTIVATION.md).

- [x] GitHub Actions runs again (October 2026); all CI/security workflows run on every pull request. Still to do: require them via branch protection.
- [x] Docker builds install with `npm ci` from committed lockfiles; production dependencies have no known vulnerabilities (`npm audit --omit=dev`, October 2026).
- [ ] Configure Railway production secrets exactly as documented in `server/.env.example` and run `npm run production:validate` successfully.
- [ ] Confirm Railway `TRUST_PROXY_HOPS` against the real deployed proxy topology.
- [ ] Test the production EgoSMS account/sender (production requires `SMS_PROVIDER=egosms`).
- [ ] Configure the production S3 KYC bucket, encryption policy, retention/access controls and credentials/role.
- [ ] Verify Smile ID in sandbox with approved test identities; switch `SMILE_ENV=production` only after provider approval.
- [ ] Run MarZPay sandbox/end-to-end tests for disbursement, collection, duplicate/replayed callback, amount mismatch, provider identity mismatch and reconciliation recovery.
- [ ] Verify database backup/restore and migration rollback/recovery procedure on a non-production copy.
- [ ] Enable branch protection/ruleset on `main`: pull request required, required status checks, no force pushes, and at least one approval for production changes.
- [ ] Resolve the remaining release gates before unrestricted launch. Live money is currently enabled at the owner’s request; this does not prove release readiness.

See [the dated public-launch review](docs/PUBLIC_LAUNCH_REVIEW_2026-11-06.md) for current evidence.

## Controlled cleanup after CI/install tooling is available

- [ ] Regenerate the root `package-lock.json`, then remove the dormant `@supabase/supabase-js` package and compatibility module after confirming there are no remaining imports.
- [ ] During that same verified dependency pass, remove root-level backend-only dependencies that are no longer used by frontend scripts/tests.
- [ ] Decide whether to migrate persisted borrower roles from legacy `user` to `customer`. Runtime already normalizes both, so this is not required for launch and must be a tested data migration rather than an ad-hoc update.
- [ ] Remove the dormant Wallet model/table only after a migration proves no historical/reporting code needs it. Customer wallet functionality is already disabled in production.

## Product polish that is not a launch blocker

- [ ] Add audited Keychain/Android Keystore-backed refresh-token persistence if persistent native login is desired; current native behavior intentionally requires login after a cold restart.
- [ ] Consider asynchronous Smile ID callbacks and persisted provider job history if KYC throughput grows enough to require it.
