-- ============================================================================
-- Transactions ledger + extra loan fields + indexes.
-- Additive over 0001_init.sql.
-- ============================================================================

-- ── Extra loan fields (match the LOANS spec) ────────────────────────────────
alter table public.loan_applications
  add column if not exists interest_rate       numeric(5,4) not null default 0.26,
  add column if not exists service_fee_rate    numeric(5,4) not null default 0.10,
  add column if not exists service_fee         bigint       not null default 0,
  add column if not exists disbursement_method text         not null default 'mtn_momo'
    check (disbursement_method in ('mtn_momo','airtel_money','bank')),
  add column if not exists approved_by         text,
  add column if not exists due_date            timestamptz;

-- Allow the richer lifecycle states from the spec.
alter table public.loan_applications drop constraint if exists loan_applications_status_check;
alter table public.loan_applications
  add constraint loan_applications_status_check
  check (status in ('pending','approved','rejected','active','paid','overdue','failed'));

-- ── Transactions ledger ─────────────────────────────────────────────────────
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  loan_id        text,
  type           text not null check (type in ('loan_disbursement','loan_payment','savings_deposit','savings_withdrawal')),
  amount         bigint not null,
  status         text not null default 'pending' check (status in ('pending','completed','failed')),
  transaction_id text,                       -- MTN / Airtel provider reference
  created_at     timestamptz not null default now()
);

alter table public.transactions enable row level security;
create policy "transactions read"  on public.transactions for select
  using (user_id = auth.uid() or public.is_admin());
create policy "transactions write" on public.transactions for insert
  with check (user_id = auth.uid() or public.is_admin());

-- ── Indexes for fast queries (phone, user_id, status) ───────────────────────
create index if not exists profiles_phone_idx       on public.profiles (phone);
create index if not exists transactions_user_idx    on public.transactions (user_id, created_at desc);
create index if not exists transactions_loan_idx    on public.transactions (loan_id);
create index if not exists transactions_status_idx  on public.transactions (status);
create index if not exists loan_apps_status_idx     on public.loan_applications (status);
create index if not exists repayments_status_idx    on public.repayments (status);
