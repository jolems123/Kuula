-- ============================================================================
-- Savings goals + notifications tables.
-- Apply in Supabase Dashboard → SQL Editor, or via: supabase db push
-- ============================================================================

-- ── Savings goals (per-user financial goals) ─────────────────────────────────
create table if not exists public.savings_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  emoji      text not null default '🎯',
  target     bigint not null check (target > 0),
  saved      bigint not null default 0 check (saved >= 0),
  color      text not null default '#2563EB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;

create policy "goals owner rw" on public.savings_goals for all
  to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "goals admin read" on public.savings_goals for select
  using (public.is_admin());

create index if not exists savings_goals_user_idx on public.savings_goals (user_id, created_at);

-- ── Notifications (system alerts for each user) ──────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null,
  type       text not null default 'info' check (type in ('success','warning','info','alert')),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications owner read" on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications owner update" on public.notifications for update
  to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notifications admin rw" on public.notifications for all
  using (public.is_admin());

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, is_read) where is_read = false;
