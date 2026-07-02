-- ============================================================================
-- Kuula — initial schema, Row-Level Security, and triggers.
-- Mirrors the data model in server/core.mjs so behaviour is identical whether
-- the app runs on the Node reference backend or Supabase.
--
-- Apply with:  supabase db push        (or paste into the SQL editor)
-- ============================================================================

-- ── Profiles (1:1 with auth.users) ──────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'user' check (role in ('user','admin')),
  full_name     text not null default '',
  phone         text,
  email         text,
  national_id   text,
  district      text,
  occupation    text,
  verified      boolean not null default false,
  -- credit-scoring inputs
  momo_months   int not null default 0,
  momo_txn_count int not null default 0,
  crb_status    text not null default 'thin' check (crb_status in ('clean','thin','adverse')),
  kyc_verified  boolean not null default false,
  loans_total   int not null default 0,
  loans_repaid  int not null default 0,
  created_at    timestamptz not null default now()
);

-- ── Savings & wallet (one row per user) ─────────────────────────────────────
create table if not exists public.savings_accounts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0)
);

-- ── Support messages (customer ↔ admin) ─────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 4000),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists messages_participants_idx on public.messages (sender_id, receiver_id, created_at);

-- ── Loan applications ───────────────────────────────────────────────────────
create table if not exists public.loan_applications (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  applicant_name  text not null default '',
  amount          bigint not null check (amount > 0),
  purpose         text not null default 'Personal',
  term_days       int not null default 90 check (term_days >= 90),  -- Google ≥60-day rule
  channel         text not null default 'MTN MoMo',
  apr             numeric(5,4) not null default 0.336 check (apr <= 0.36), -- Apple 36% cap
  interest        bigint not null default 0,
  total           bigint not null default 0,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  disbursement_ref text,
  loan_id         text,
  decision_notes  text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists loan_apps_applicant_idx on public.loan_applications (applicant_id, created_at desc);

-- ── Repayments / collections ────────────────────────────────────────────────
create table if not exists public.repayments (
  id          uuid primary key default gen_random_uuid(),
  loan_id     text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  total       bigint not null,
  amount_paid bigint not null default 0,
  due_date    timestamptz not null,
  status      text not null default 'scheduled' check (status in ('scheduled','paid','overdue')),
  receipt_id  text,
  attempts    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists repayments_user_idx on public.repayments (user_id);

-- ── Helper: is the current user an admin? (SECURITY DEFINER avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ── Enable RLS ──────────────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.savings_accounts  enable row level security;
alter table public.wallets           enable row level security;
alter table public.messages          enable row level security;
alter table public.loan_applications enable row level security;
alter table public.repayments        enable row level security;

-- ── Policies: profiles ──────────────────────────────────────────────────────
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

-- ── Policies: savings & wallet (owner only; admins read) ────────────────────
create policy "savings owner rw"  on public.savings_accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "savings admin read" on public.savings_accounts for select using (public.is_admin());
create policy "wallet owner rw"   on public.wallets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wallet admin read"  on public.wallets for select using (public.is_admin());

-- ── Policies: messages (your own thread; admins everything) ─────────────────
create policy "messages read" on public.messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin());
create policy "messages send" on public.messages for insert
  with check (sender_id = auth.uid());

-- ── Policies: loan applications ─────────────────────────────────────────────
create policy "loans read own"   on public.loan_applications for select
  using (applicant_id = auth.uid() or public.is_admin());
create policy "loans insert own" on public.loan_applications for insert
  with check (applicant_id = auth.uid());
-- Only admins change status (decision); the Edge Function uses the service key.
create policy "loans admin update" on public.loan_applications for update using (public.is_admin());

-- ── Policies: repayments ────────────────────────────────────────────────────
create policy "repayments read" on public.repayments for select
  using (user_id = auth.uid() or public.is_admin());
create policy "repayments owner write" on public.repayments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── New-user bootstrap: profile + savings + wallet ──────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.phone,
    new.email
  )
  on conflict (id) do nothing;
  insert into public.savings_accounts (user_id) values (new.id) on conflict do nothing;
  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Loan decision → instant disbursement + repayment schedule ───────────────
-- When an admin flips an application to 'approved', disburse to the wallet and
-- create the repayment plan atomically. SECURITY DEFINER so it can write the
-- borrower's wallet/repayment rows despite owner-only RLS.
create or replace function public.handle_loan_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and coalesce(old.status,'') <> 'approved' then
    new.decided_at := now();
    new.loan_id := 'LN-' || substr(new.id::text, 1, 8);
    new.disbursement_ref := upper(substr(new.channel,1,3)) || '-' || upper(substr(md5(random()::text),1,8));
    update public.wallets set balance = balance + new.amount where user_id = new.applicant_id;
    insert into public.repayments (loan_id, user_id, total, due_date)
    values (new.loan_id, new.applicant_id, new.total, now() + (new.term_days || ' days')::interval);
  elsif new.status = 'rejected' and coalesce(old.status,'') <> 'rejected' then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_decision on public.loan_applications;
create trigger on_loan_decision
  before update on public.loan_applications
  for each row execute function public.handle_loan_decision();
