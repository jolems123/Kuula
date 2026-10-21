# Kuula: Sentry → Seer → GitHub (automated proposals)

This is an **opt-in automation** that runs hourly after merging the workflow to the default branch and completing configuration. It is NOT a continuously running ChatGPT session. Sentry Seer performs automatic diagnosis, generates changes, and attempts a GitHub pull request. PRs are **not merged automatically**.

## Required connections

1. In Sentry, link the Kuula Sentry project to `jolems123/Kuula` using the official GitHub integration, then enable **Seer** and Seer's automated fix / pull-request features. Seer may be billable and subject to organization settings.
2. In GitHub repository **Settings → Secrets and variables → Actions**:
   - Secret `SENTRY_AUTH_TOKEN`: Sentry API token with `event:write` or `event:admin`. Add as a GitHub Actions secret; a token already in Railway does not automatically become available in GitHub.
   - Variable `SENTRY_ORG`: Sentry organization slug.
   - Variable `SENTRY_PROJECT`: the Kuula Sentry project ID or slug.
3. Ensure workflow permissions allow creating GitHub Issues. Seer needs its own Sentry-to-GitHub installation permissions to create PRs.
4. Go to **Actions → Sentry Seer Automated Investigation → Run workflow** for a controlled first run, then inspect workflow logs and resulting Issues/PRs.
5. Ensure **main** has required CI checks and branch protection/rulesets. Onboarding requires a human to authorize changes to payment processing, identity, authentication, finance, schema/migrations, GitHub Actions, or deployment configuration.

## Safeguards

- The scheduled job examines a bounded number of unresolved error issues, scoped to `SENTRY_PROJECT`, and initiates **at most two paid Seer runs per hour**.
- It creates a GitHub tracking issue before triggering Seer; subsequent polls skip issues already tracked.
- Seer is asked to produce small, tested patches and avoid sensitive subsystems. This prompt is guidance, not an enforceable sandbox; independent code reviews and branch protection are necessary.
- No terminal, background ChatGPT session, or private chat receives Sentry events directly.
- If GitHub and Sentry credentials are missing, workflow fails with configuration error instead of silently claiming success.
- If Seer rejects the request due to plan, scopes, project/repository mapping or organization settings, a note is posted to the tracking issue; an authorized operator must inspect and retry.
- **Automatic merge deliberately NOT configured:** the GitHub repository currently reports auto-merge disabled, and automated fixes to real-money lending code need independent security and financial checks. Enabling blind merge would be unsafe.

## Verification

After configuring, verify the actual Sentry source event, GitHub tracking issue, Seer execution, generated PR, passing CI and manual review before permitting any production deployment. Rollout gradually. Never copy Sentry API tokens into commits or ChatGPT messages.

References: https://docs.sentry.io/api/seer/start-seer-issue-fix/ and https://docs.sentry.io/api/events/list-an-organizations-issues/
