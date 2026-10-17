# Kuula: officer-priced business loan offers — implementation contract

Status: **SPECIFICATION ONLY; NOT IMPLEMENTED.** No production financial contract or schema is changed by this document.

## Product decision
Customers request principal, loan period (30–365 days), and purpose. They do not set loan interest or charges. Level 1 loan/field officer prepares a **proposed** financing quote only after business assessment. Level 2 checks affordability and pricing independently; Level 3 final authority approves or returns the quote. The approved immutable offer is presented to the customer for explicit accept or decline. Independent staff disbursement release stays mandatory.

## Required offer fields
- Approved principal and term days; currency (UGX); interest rate, annualized APR if applicable, rate period (per annum/per month/per term), simple versus reducing-balance calculation method.
- Interest amount; itemized named charges with amount and whether withheld from proceeds or financed; any legally permissible taxes; net disbursement; total repayment, number/frequency/due dates/amounts of installments.
- Default, prepayment and late-payment provisions, when permitted, clearly explained. Missing fees must be explicitly zero rather than undisclosed.
- Offer expiry, offer version, approval timestamp, approver identity, agreement hash and repayment schedule snapshot.

## Enforcement
1. Use numeric decimal/money-safe arithmetic. Enforce rate and fee policy limits configured and authorized for the institution; no unconstrained interest/fees. Recalculate fees and totals on the **server**; never trust the browser's computation.
2. Existing application-time `quoteForRequest` can at most be a **nonbinding illustrative estimate**. Do not publish a firm rate before credit assessment. The server currently stores quote APR/interest/total on application creation; **replace this dependency as part of the migration**, not by a front-end-only change.
3. Only authorized loan officers may propose terms. They cannot self-approve. Level 2/3 approvals must match the exact proposal version, and pricing changes invalidate earlier approvals.
4. On final approval, create a server-persisted immutable offer-version snapshot. No rates, fees, payment dates or total may be changed post-approval without a *new* version and renewed review and customer consent.
5. The customer must see a clear itemized quotation **before** the accept control; downloadable PDF and electronically signed agreement must contain the same offer ID/version/hash.
6. Reject agreement acceptance if an offer is expired, withdrawn, superseded, not approved, or missing required pricing details. Require signed name/explicit consent, ensure acceptance is idempotent, and record timestamp, identity and agreed version/hash.
7. The disbursement workflow may use **only** the accepted quote, and still requires existing independent release controls, eligibility and destination verification.
8. Persist audit records for drafting terms, price edits, recommendations, approvals, customer acceptance/rejection and release events. Exclude internal confidential staff narratives from the customer's agreement.

## Repository implementation surfaces
- `server/prisma/schema.prisma`: new offer/version and fee-line models or immutable JSON snapshots with normalized audit records, migrations (avoid breaking existing accepted loans).
- `server/src/routes/loans.ts`: canonical officer terms endpoints and validation; currently `/applications/decision` derives an offer from a quote set **at application submission**; `/:id/agreement/accept` currently hashes principal, APR, interest, total and hardcoded serviceFee=0. Both must use exactly the approved snapshot.
- `src/app/components/screens/CreditCaseReviewStableScreen.tsx` and `CreditOperationsScreens.tsx`: restricted staff quote form, review, approval.
- `src/app/components/screens/LoanAgreementScreen.tsx`: read-only itemized customer offer, due dates, downloadable matching document, accept/decline.
- `src/app/api/client.ts` and `src/app/api/types.ts`: typed proposal, final-offer and acceptance API.
- Server tests: pricing precision, negative/zero/over-limit fees, rate basis, snapshot immutability, tenant isolation, role separation, replay/expiry/changed offers, disbursement without acceptance, exact PDF-to-accepted-data equality.
- Migration: keep already accepted offers and active loans unchanged; explicitly version legacy records, and require fresh pricing review for unaccepted pending/offered records before acceptance.

## Definition of done
Real test business loan: customer requests UGX 1,000,000 for 90 days; officer selects a policy-compliant rate and two separately identified charges; senior and final approver independently authorize the exact quote; customer sees principal, interest basis, fees, net proceeds, full repayment schedule and downloadable terms; changes to quote force a new version and customer acceptance; no disbursement before independent release. Confirm three-way consistency between approved quote, downloaded PDF and signed snapshot, with successful backend, browser and authorization tests.

**Regulatory gate:** Have local counsel/compliance validate Uganda disclosure, fair lending, interest/fee treatment and applicable consumer-protection rules before enabling custom pricing in production.
