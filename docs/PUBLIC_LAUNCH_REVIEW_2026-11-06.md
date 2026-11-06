# Public launch review — 6 November 2026

Decision: not ready for unrestricted public lending. Healthy deployments and green CI do not establish the external controls below.

## Verified evidence

- Railway API, web and PostgreSQL are online; API readiness reports database/schema ready.
- PR #143 passed the automated financial lifecycle with a simulated provider, including fixed customer payment fees of 3%, settlement and replay controls.
- PR #144 passed CI and deployed the admin application-list crash fix.
- Synthetic signed callback authentication was checked; actual provider delivery and a complete real-provider payout/repayment remain unverified.
- Live money is enabled at the owner’s request. No live payment was initiated in this review.

## Required release evidence

| Gate | Finding / required action |
| --- | --- |
| Staff authentication | Production `STAFF_EMAIL_MFA_REQUIRED` absent. Verify staff email OTP delivery and recovery, then enable and verify MFA. Do not lock out staff by enabling before delivery is proven. |
| Provider lifecycle | Complete an eligible, consented loan with independent finance release using the actual provider; verify payout, collection, fees, callbacks, journals and provider reconciliation. Simulated CI is insufficient. |
| Credentials | Rotate previously exposed API credentials/signing secrets and Railway tokens; verify replacements and callback delivery. Rotation has not been demonstrated. |
| Recovery | Restore a production backup into an isolated database and record integrity/count checks and recovery steps. No completed drill evidence available. |
| Change controls | GitHub main branch is unprotected and repository rulesets empty. Require PR review and passing checks; prohibit force pushes. |
| Regulatory and customer terms | Obtain recorded confirmation of applicable lending authority, data protection registration, approved pricing/agreements and complaints process. Status is unverified, not assumed absent. |
| Operational security | Record independent penetration-test closure, real SMS/email delivery, KYC storage/access/retention verification and incident ownership. Environment variable names alone are insufficient evidence. |

## Accounting correction

Repayment allocation previously treated accepted loan service fees as principal, which could leave a negative principal receivable after full payoff. The correction classifies interest, already agreed loan fees and principal separately, with the fixed 3% payment fee in its own income account. No borrower charge is added by this correction. Unit coverage includes partial fees, excess funds and complete payoff; the CI financial lifecycle now requires principal receivable to close exactly to zero.

Historical posted journals are not rewritten by this change. Finance must review any already settled loans for misclassification and use approved correcting entries if needed.

This review is a release evidence checklist, not a legal approval or independent security certification.

## Technical closeout follow-up

- Added staff email MFA and account recovery integration coverage using the real TLS SMTP client against an isolated test server. It verifies no password-only session, invalid/replayed OTP rejection, session revocation after recovery, and failure without fallback when SMTP rejects authentication. This does not prove delivery to production staff mailboxes.
- SMTP errors now omit command contents, including base64-encoded authentication credentials; pending delivery rejects cleanly when the connection closes.
- Added a disposable PostgreSQL backup roundtrip to CI after the financial lifecycle: pg_dump, pg_restore, all tracked table counts compared, balanced journals and valid journal links. Production backup restoration remains a separate gate.
- Restore verification now requires expected source counts, so an empty or incomplete restore cannot be marked PASS without comparison.
- GitHub administration requires owner sign-in; connected repository tools do not expose administration writes. The current shell and browser have no owner session.
- Provider credential rotation and a provider payment cannot be replaced by code changes. Lending/data-protection approvals and independent penetration testing need external evidence.
