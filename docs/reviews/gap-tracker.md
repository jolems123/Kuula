# Kuula gap tracker — 2026-11-08

Base: main @ 6bff08ed9a5285fd34ba79c21917545b132cbe31. Branch: fix/kuula-gap-closure.
Statuses distinguish **fixed in code, not yet CI verified** from **unverified**. No live payment, external API, production environment, or shared database was touched.

| Area | Gap | Severity | File:line | Fix | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Money inputs | Fractional/unsafe integer UGX silently rounded in underwriting | High | server/src/lib/underwriting.ts:35 | Reject values outside safe nonnegative integers; retain positive constraints | underwriting.security.test.ts fractional, unsafe, infinity | Fixed in branch; CI pending |
| Money inputs | Principal rounded instead of rejected in authoritative quote | High | server/src/lib/pricing.ts:25 | Require positive safe integer UGX | pricing.test.ts fractional and unsafe principal | Fixed in branch; CI pending |
| Money inputs | Loan affordability money helper silently rounded submitted amounts | High | server/src/routes/loans.ts:48 | Reject noninteger or unsafe UGX | underwriting and pricing tests; route E2E still needed | Fixed in branch; route test outstanding |
| Loan offers | Officer-priced multi-level immutable offer with approval/versioning is explicitly specification-only | Critical | docs/officer-priced-loan-offer-requirements.md:1 | Design additive offer/version schema, independent level-2/3 approvals, snapshot and acceptance; do not alter accepted legacy loans | Full pricing, PDF/hash, role and disbursement tests required | Open |
| Loan applications | Canonical loans.ts list appears unscoped for reviewers, but earlier-mounted read-routes.ts currently shadows it and enforces assignment | High defense-in-depth | server/src/routes/loans.ts:126; server/src/routes/loan-application-read-routes.ts | Verify middleware order and remove unsafe fallback or share scoping helper without breaking current route | Cross-officer API integration tests | Unverified (do not claim exploitable) |
| Payment provider | Real MarzPay sandbox response shapes, signed webhook replay, fee difference and settlement need external confirmation | Critical | docs/REAL_MONEY_ACTIVATION.md §2 | Run isolated sandbox certification with documented evidence, never in production | Scenarios 2.1–2.12 | NEEDS ME |
| Compliance | Lending authority, pricing/allocation, underwriting limits, guarantees and collection texts lack documented legal approvals | Critical | docs/REAL_MONEY_ACTIVATION.md §1 | Counsel and credit committee sign-off | Signed records | NEEDS ME |
| Authentication | Production staff MFA delivery and recovery not externally verified | Critical | TODO.md; docs/PUBLIC_LAUNCH_REVIEW_2026-11-06.md | Verify delivery and recovery before enabling; do not change flags here | Production-safe delivery evidence | NEEDS ME |
| Credential security | Previously exposed Railway token rotation unverified | Critical | docs/REAL_MONEY_ACTIVATION.md §1.10 | Rotate via owner-secured management, avoid logging values | Owner rotation evidence | NEEDS ME |
| KYC | Production S3 controls, EgoSMS sender and Smile ID approvals unverified | High | TODO.md | Configure providers and review encryption, retention, consent | Sandbox, access and delivery tests | NEEDS ME |
| Recovery | Actual isolated restoration of production backup unverified | Critical | docs/PUBLIC_LAUNCH_REVIEW_2026-11-06.md | Restore to isolated database and compare expected counts | Read-only restore verifier and ledger balance | NEEDS ME |
| CI/governance | Required branch protection and independent penetration-test closure not established | High | TODO.md | Owner enable protection, independent review | GitHub settings and signed report | NEEDS ME |
| Release | Mobile real-device testing, accessibility/translation completeness, role-by-role Playwright journeys not evidenced for current commit | High | docs/APP_FLOW_REVIEW.md; TODO.md | Expand CI and manual device release matrix | Role-permission, axe, 360px, Android/iOS | Open |

## NEEDS ME — do not change production settings

REAL_MONEY_ENABLED, GUARANTOR_LEGAL_TERMS_APPROVED, GUARANTOR_SMS_ENABLED, SMILE_ENV=production, STAFF_EMAIL_MFA_REQUIRED. Also owner verification for Railway secrets, S3 credentials and retention, EgoSMS sender and delivery, Smile ID approval, signing-key/token rotation, lending/guarantee legal terms and regulatory authorization.

## Outstanding verification

Run the exact root/server npm installs, typechecks, Prisma validate/generate, tests, builds, both production dependency audits, Playwright multi-role journeys, gitleaks history scan and isolated database financial suite. No results are asserted until logs are available. GitHub Actions must show green on this PR before review. No merge or live release.
