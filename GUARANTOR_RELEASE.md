# Kuula guarantor workflow — release checklist

Status: DRAFT. Do not deploy to production before independent testing and legal review.

## Workflow
1. Borrower submits application without a guarantor.
2. Loan officer records a justified guarantor requirement.
3. Borrower nominates a contact after permission to contact is obtained.
4. Kuula sends a secure invitation using a 256-bit opaque token.
5. Nominee independently opts in or declines.
6. Final credit terms are prepared and offered to borrower.
7. Guarantor opens invitation, signs into a distinct Kuula account, and completes standard phone and KYC verification.
8. Guarantor reviews maximum liability, seeks independent legal advice, confirms explicit consent, receives a fresh SMS code and signs.
9. Independent credit approver validates the existing KYC status, OTP-backed signature integrity and disclosed terms. Only then is requirement marked verified.
10. Disbursement authorization and payout dispatcher refuse unresolved requirements.

## Required configuration
- `GUARANTOR_INVITE_BASE_URL`: canonical HTTPS Kuula customer web origin (not including a route or hash).
- `GUARANTOR_SMS_ENABLED=true`: only after dedicated consent/OTP SMS channel is verified.
- `SMS_PROVIDER=egosms`, `EGOSMS_USERNAME`, `EGOSMS_PASSWORD`, registered sender identity.
- `OTP_PEPPER`: cryptographically strong secret with at least 32 characters, provided via secure configuration.
- `GUARANTOR_LEGAL_TERMS_APPROVED=true`: **never** set until counsel approves the exact displayed liability, disclosure and signing language. The included legal text is a technical draft, not legal advice.

Do not enable `GUARANTOR_LEGAL_TERMS_APPROVED` in production without confirming a lawful electronic guarantee undertaking for the relevant jurisdiction.

## Verification before merging
- `npm ci --legacy-peer-deps && npm run typecheck && npm test && npm run build`
- `cd server && npm ci && npx prisma validate && npx prisma generate && npm run build && npm test`
- Apply all four migrations to isolated PostgreSQL using `prisma migrate deploy` and verify rollback/restore process.
- Verify SMS delivery and throttling, expired invitation handling, OTP replay blocking, identity mismatch, signature hash integrity, duplicate requests, and distinct borrower/guarantor identities.
- Verify loan officer cannot self-approve guarantee or waiver.
- Verify required or signed-pending-review guarantee blocks every payment, including multi-leg retry and reconciliation paths.
- Verify optional-guarantor loans still complete the existing loan lifecycle.
- Verify all existing CI workflow gates and smoke tests pass on current `main` before merge.
- Review production email/SMS privacy, KYC access, retention, data protection and Uganda lending requirements with counsel.

## Known constraints
- Current guarantor design requires the guarantor to register and complete Kuula's existing KYC workflow; it does not implement a second external KYC provider.
- Invitation SMS dispatch is opt-in; when disabled, delivery is not confirmed.
- This branch is not production-ready unless all tests, counsel review, provider verification and release approvals pass.
