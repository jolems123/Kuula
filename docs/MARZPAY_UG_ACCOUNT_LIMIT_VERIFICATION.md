# MarzPay Uganda limits — finance verification

Checked 2026-11-11 against MarzPay's official documentation:
- https://wallet.wearemarz.com/documentation/send-money
- https://wallet.wearemarz.com/documentation/faq
- https://wallet.wearemarz.com/documentation/api

Public Uganda send-money API bounds: **UGX 500 minimum; UGX 10,000,000 maximum per request**. Both MTN and Airtel are supported. These are *technical/public bounds*, not a verified limit for Kuula's own MarzPay account. MarzPay states limits are per business and market. No published account-specific daily ceiling was established.

## Safe workflow
1. Finance signs in with `reconciliation.manage` permission and calls `GET /api/admin/payment-provider-limits/marzpay-account-limits`. This read-only endpoint uses Kuula's configured MarzPay credentials to inspect the account's Uganda withdrawal bounds. It does not move money or change settings.
2. Confirm MTN and Airtel network eligibility and actual daily limits with the Kuula MarzPay business account or support. Do not treat the general account limit as proof of network-specific allowances.
3. Inspect current entries with `GET /api/admin/payment-provider-limits`. For each verified network, create a record using the existing `POST /api/admin/payment-provider-limits` endpoint with `marketCode: "UG"`, `provider: "marzpay"`, `beneficiaryType: "customer"`, and `network: "mtn"` or `"airtel"`. Populate `minAmount`, `maxSingleAmount`, `maxDailyAmount` (null only when no daily cap is specified) and an evidence-backed `sourceNote`.
4. Use the stricter of the verified account, network and beneficiary limits. Never enter a higher value simply because the public API ceiling permits it.
5. Test fee disclosure, agreement acceptance and payout planning separately for MTN and Airtel, using controlled non-production accounts. Live payout release continues to require independent finance authorization.

**No live limit records are created by this change.** Until verified records exist, production customer agreement fee disclosure may still reject an unconfigured network. This is intentional fail-closed behavior.
