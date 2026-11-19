# Kuula ↔ Kelelego MarzPay configuration parity (2026-11-19)

## Verified from code and Railway metadata

| Setting | Kelelego | Kuula |
|---|---|---|
| API host | `https://wallet.wearemarz.com/api/v1` | Same default, production host validation |
| Authentication | HTTP Basic, `MARZ_API_KEY` + `MARZ_API_SECRET` | HTTP Basic, `MARZPAY_API_KEY` + `MARZPAY_API_SECRET` |
| Collections | `POST /collect-money` | Same |
| Disbursements | `POST /send-money` | Same |
| Callback | Re-queries MarzPay transaction rather than trusting unsigned callback | Rejects unsigned callback in live mode; reconciles with provider lookups |
| Duplicate settlement | Intent tracking and service guards | Atomic ledger claims and webhook receipt tracking |
| Payout safety | Driver payout fees | Borrower loan release, finance approval, disbursement legs and ledger |
| Railway service | `kelelego-api` | `kuula-api`; deployment SUCCESS on inspected revision |

Kuula already has **all five** production variable names present:
`MARZPAY_API_KEY`, `MARZPAY_API_SECRET`, `MARZPAY_WEBHOOK_SECRET`,
`MARZPAY_WEBHOOK_SIGNATURE_SECRET`, and `PUBLIC_API_URL`. Presence is **not** proof that credential values,
account permissions, sandbox/live mode, callback signing or a real payment work.
Railway OAuth redacts values, so secrets cannot and should not be copied from Kelelego into Kuula.
MarzPay uses separate account-specific credentials, permissions, balance and signing configuration.

## Read-only provider check

From the **Kuula API** runtime with existing credentials (no secret output):

```sh
node scripts/marzpay-readonly-readiness.mjs
```

The diagnostic only sends `GET /balance?country=UG`; it prints an account-active indication,
reported sandbox mode, JSON shape validity and the expected webhook URL. It **never** sends money.
The user must confirm MarzPay's signing toggle is enabled in Business Settings → Webhooks & Security,
that the configured signing secret matches Kuula's, and that payout permissions and permitted IPs are correct.

The expected callback is
`https://api.kuulapp.com/api/payments/marzpay/webhook`.

Do **not** relax Kuula's signed-webhook requirement to mimic Kelelego's unsigned callback handling.
The correct integration for lending is to enable signing with MarzPay and verify the signature.
The signature setup is described in MarzPay's official webhooks documentation:
https://wallet.wearemarz.com/documentation/webhooks

## Activation gates not proven by this comparison

1. Independently confirm Uganda account KYC, mobile-money collection/send-money privileges and Railway egress IP approval.
2. Confirm the provider's sandbox flag with read-only check; run signed webhook, payout, collection, duplicate and reconciliation **in sandbox**, never on customers.
3. Check actual `REAL_MONEY_ENABLED` value using an authorized operator; names alone do not expose this value.
4. Verify ledger balance, refund/partial-payment behavior and a known approved live transfer before public release.
5. Do not run GitHub-hosted CI; use isolated test infrastructure and review the changes before merging.
