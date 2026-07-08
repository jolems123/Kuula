-- Kuula — loan offer acceptance.
--
-- A loan no longer disburses the instant an admin approves it. Admin approval
-- now produces an OFFER (status 'offered'); the borrower must open the loan
-- agreement and accept it, which is the only step that releases real money.
--
--   pending  →  (admin approves)  →  offered   ← no money, no booking
--   offered  →  (borrower accepts)→  approved  ← MarzPay payout + booking trigger
--
-- The on_loan_decision trigger still fires only on 'approved'/'rejected', so the
-- 'offered' state books nothing.

-- 1) Allow the new 'offered' status.
alter table public.loan_applications drop constraint if exists loan_applications_status_check;
alter table public.loan_applications
  add constraint loan_applications_status_check
  check (status in ('pending','offered','approved','rejected','active','paid','overdue','failed'));

-- 2) Acceptance idempotency lock. The marzpay-disburse function claims the offer
-- by compare-and-set on accepted_at (NULL -> now) BEFORE any external payout,
-- without changing status (so it does not fire the booking trigger). A concurrent
-- second acceptance loses the race here and never reaches MarzPay.
alter table public.loan_applications add column if not exists accepted_at timestamptz;
