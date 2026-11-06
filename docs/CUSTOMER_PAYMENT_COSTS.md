# Customer payment costs

Policy: `marzpay-ug-mobile-money-2026-11-06`. Source: https://wallet.wearemarz.com/pricing (checked 6 November 2026).

For new customer Mobile Money loan agreements, accepted payout costs come out of principal. The net amount, fee, collection rate and actual transfer plan are saved inside the hashed agreement snapshot. Existing accepted agreements and existing batches retain lender-paid costs. Restricted-purpose partner invoice settlements retain full invoice payment and lender-paid costs; this change does not reduce a partner's invoice or amend an existing contract.

Uganda mobile-money collections: 3% of the gross collected. To credit UGX 50,000 to a loan, collect `ceil(50000 / 0.97)` = UGX 51,547, of which UGX 1,547 is the disclosed fee allowance. A successful provider callback or status lookup must confirm the gross and actual charge. Pending/failed attempts do not credit the loan. Do not use this tariff for cards.

Published Uganda mobile-money payouts are flat fees on the net sent: UGX 1,000 up to 50,000; 1,500 up to 300,000; 2,800 up to 750,000; 5,000 up to 5,000,000. Thus UGX 50,000 approved principal pays UGX 49,000, with UGX 1,000 deducted. Split payouts disclose each transfer's separate cost. Amounts in tariff gaps fail closed and require a revised offer rather than retaining unallocated change. Verified destination limits still apply.

Repayment quotes are server-calculated and require confirmation of the policy and exact gross debit. An old client cannot silently initiate a fee-bearing payment or accept a fee-bearing offer. The UI and agreement PDF disclose the loan credit, payment cost, net payout, gross collection formula, and annualised simple total cost on net cash received (single full repayment). Repayment fees never increase loan credit or interest income.

Transactions store gross provider amount and frozen customer fee separately. Journals recover at most the actual provider cost against provider-fee expense. Lower actual charges leave customer money held in the existing refund workflow, never hidden income. Higher provider charges are absorbed by Kuula, without increasing the customer's disclosed debit, and flagged for reconciliation. Unconfirmed costs do not settle recovered-fee transactions. Refunds remain independently authorized.

Release validation includes the published provider fee in required wallet funding. Before rollout confirm that MarzPay's business-specific fees match the published tariff; custom rates require a new versioned tariff and new agreement acceptance. Do not exercise live payments to validate this implementation. CI uses isolated PostgreSQL and fake MarzPay, including the real quote/consent/settlement/replay paths.
