# Fixed 3% customer payment fees

Policy: `kuula-fixed-three-percent-2026-11-06`.

For newly accepted customer Mobile Money cash loan agreements, deduct `ceil(principal * 0.03)` once from the approved principal. A UGX 50,000 principal pays out UGX 48,500 and carries a UGX 1,500 customer disbursement fee. Principal and contractual loan repayment remain unchanged. Split payouts apportion this single fee; splitting does not charge 3% repeatedly or multiply rounding.

For each repayment collect `loanCredit + ceil(loanCredit * 0.03)`. A UGX 50,000 loan credit charges the phone UGX 51,500, with UGX 1,500 customer payment fee. Only the UGX 50,000 credits the loan. Partial and full repayments use the same rule. The server quotes the exact debit and requires matching confirmation before initiating collection.

These are Kuula's fixed customer fees, not a representation of MarzPay's actual tariff. Published MarzPay Uganda mobile-money collections cost 3% of the gross amount collected, and payout fees are tiered flat amounts (https://wallet.wearemarz.com/pricing). Hence collecting UGX 51,500 can leave Kuula UGX 49,955 after provider charges: Kuula absorbs that UGX 45 shortfall without reducing customer loan credit. The customer fee stays 3% even when actual provider cost differs.

Customer fees are credited to PAYMENT_FEE_INCOME. Actual provider costs are separately debited to PROVIDER_FEE_EXPENSE. Journals remain balanced; actual provider cost differences are flagged for reconciliation. No fee-saving refund is created under this fixed policy. Genuine loan overpayments retain the existing refund process. Failed or pending provider attempts do not credit the loan or post fee income.

Fee disclosure and the transfer plan are frozen in the hashed agreement. Agreements and PDFs show approved principal, the 3% deducted, net cash, repayment fee formula, full-payment example and annualised simple total-cost rate on net cash. Receipts distinguish customer fee and actual provider cost.

Previously accepted contracts and existing batches keep their agreed lender-paid terms. Restricted-purpose partner invoice settlements retain full invoice payment and their current terms. No live payment is required for testing. GitHub CI uses isolated PostgreSQL and fake MarzPay to check consent, settlement, retries, duplicate callbacks, fee differences, full repayment and balanced accounting.
