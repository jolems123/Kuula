# App flow review — 14 October 2026

This is an implementation review of the local repository, with synthetic UI
sessions. It is not a certification of the deployed service or real-money
operations. Store account setup is pending at the owner's request.

## Staff signup and sign-in

1. The Super Admin adds the staff member's work email, name and role in Staff Management.
2. The staff member opens **Create account**, supplies a valid email, an 8–72 character password containing a letter and number, and confirms the password.
3. The account waits for approval. No signup code, expiring invitation or staff session is issued.
4. The Super Admin independently confirms the person's identity and clicks **Approve access**.
5. The staff member signs in with email and password and lands on the workspace for their role.

Existing approved staff can continue signing in with their passwords. Pending
invitations can use the new signup form. The protected Super Admin account is
provisioned using `server/scripts/provision-superadmin.mjs`; public signup cannot
create or replace it. Staff signup cannot select a role or replace an existing
password. Only the Super Admin can add or approve staff.

Staff signup and normal sign-in no longer use verification codes. Password
recovery still verifies control of the registered email. Customer phone
verification and PIN recovery retain their SMS codes.

Changes include password hashing, server-side password confirmation, atomic
signup and approval claims, approval enforcement on authentication and refresh,
audit events, staff profile changes revoking sessions, and single-use refresh
rotation that cannot revive a logged-out session. The browser client shares
simultaneous refresh requests rather than replaying the same token.

The existing `phoneVerified` field is retained for compatibility: for staff,
it now represents approved access, not proof that the email mailbox is owned.
Approval must therefore be an independent identity check. Email syntax validation
does not prove mailbox ownership.

## Customer ID and portrait photos

All three selections—National ID front, National ID back, and portrait—have a
**Remove photo** button. Removal clears the in-memory image and preview. A later
completion of an older conversion cannot restore a removed/replaced image.
Customers can choose the same file again, replace a photo, or cancel the picker
without losing the existing selection. Submission waits for image preparation;
photo controls are disabled during upload. Failed replacements preserve the
previous valid selection and show an error.

These controls remove unsubmitted selections. They do not erase submitted KYC
records; those remain subject to lawful retention and account-deletion policies.

## UI consistency fixes

- Signup, sign-in, recovery and staff management now consistently describe email/password access.
- Staff management no longer claims it sends an SMS invitation.
- Staff forms and action groups wrap on small screens.
- Staff navigation uses the same screen-access rules as the route guards.
- Role-specific sign-in and fallback navigation use the correct staff home.
- The inactive staff notifications button was removed until a working staff notification destination exists.
- Old `admin-otp` links open staff sign-in; obsolete code APIs/screens were removed.

## API connectivity

The packaged HTML originally allowed only a hardcoded API origin. An app built
with a different configured API URL could therefore block sign-in, session
restoration and uploads in the browser. The build now adds the configured API
origin to its Content Security Policy. The production web server reads that
built policy, rather than adding a conflicting hardcoded header. This grants
the configured origin, not arbitrary network destinations.

## Mobile/store work still required

Android and iOS projects, package ID `com.kuula.app`, signing hooks, and Codemagic
build workflows already exist. Store publishing is not connected in the current
Codemagic YAML. Google Play Console, Apple Developer/App Store Connect and
Codemagic account setup is pending; no store upload or public release was made.

Before publishing:

- Connect the developer accounts, signing credentials and appropriate restricted publishing access in Codemagic's secret/integration settings.
- Confirm the deployed HTTPS API, CORS origins, customer SMS delivery, email recovery, private KYC storage and production database migrations.
- Run clean dependency installation and native CI. The checked-in package declarations target Capacitor 8 while the CLI declaration targets 7; locally installed Capacitor packages are 7.6.7. Local browser tests do not establish a working Capacitor 8 release. Align and validate the native toolchain before release.
- Test camera/photo selection, replacement/removal, upload interruption, sign-in, logout, expired sessions and recovery on physical Android and iPhone devices.
- Verify store privacy disclosures, account-deletion flows, lending licensing evidence, reviewer access, screenshots and product terms.
- Review 30–60 day lending terms before submission. The current client/server minimum is 30 days, while the repository's Google policy threshold is 61 days. Google disallows short-term personal loans requiring full repayment within 60 days; business classification needs confirmation. Apple's loan guidance also restricts repayment in 60 days or less and caps APR including costs/fees at 36%. Do not assume store acceptance from business-lending branding alone.

Policy sources:
[Google Play Financial Services](https://support.google.com/googleplay/android-developer/answer/9876821?hl=en),
[Apple loan-guideline update](https://developer.apple.com/news/?id=ey6d8onl),
[Codemagic release pipeline](https://docs.codemagic.io/yaml-quick-start/first-signed-build/).

## Validation and limits

The frontend unit suite passed 54 tests. The backend suite passed 87 tests,
including new signup/approval and refresh-race regressions. The expanded
signup test separately passed email/password signup, pending-access rejection,
Super Admin-only approval and password-only sign-in. Frontend typechecking,
backend compilation and a production web build passed. Regenerating the stale
Prisma client fixed local compilation errors without changing the database.

The signed-out sweep passed all 57 registered routes. The authenticated/public
review passed 114 route/viewport combinations with no blank screens, runtime
errors or offscreen controls outside the intentionally closed mobile drawer.
ID-front, ID-back and portrait removal and staff signup/approval controls were
checked at both 393px and 1440px widths. The production server's security header
also passed a configured-API-origin and framing-denial check. The reusable
`scripts/ui-review.mjs` review uses synthetic customer and Super Admin sessions,
503 responses for most APIs, and phone/desktop widths. Its outputs are written
to ignored `artifacts/ui-review/`; this checks route rendering and resilience,
not successful live financial transactions or every populated workflow.

Native session tokens are currently kept in memory; restarting the app requires
sign-in until an audited Keychain/Keystore integration is configured. Neither
native biometric capability nor real push delivery is established merely by
feature flags or manifest permissions.

Live disbursement/collection, reconciliation, private storage, database recovery,
store acceptance and production end-to-end authentication remain deployment
checks. Follow `docs/REAL_MONEY_ACTIVATION.md` before enabling real money.
