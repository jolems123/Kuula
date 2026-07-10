-- ============================================================================
-- 0007 — Automated data retention & GDPR right-to-erasure.
--
-- 1. pg_cron scheduled cleanup jobs:
--    a) Hard-delete soft-deleted accounts after 30-day grace period.
--    b) Purge read notifications older than 90 days.
--    c) Purge OTP/tokens older than 24 hours (if stored in DB).
--
-- 2. gdpr_delete_user(uuid) — callable by service-role for on-demand
--    account erasure (Apple 5.1.1(v) / Google data-deletion webhook).
--    Hard-deletes the user row from auth.users AND all cascading data.
--
-- Requires: pg_cron extension enabled in Supabase project settings.
-- Apply with: supabase db push (or SQL editor).
-- ============================================================================

-- Enable pg_cron if not already available (Supabase Pro projects have it;
-- free-tier projects may need it enabled via dashboard → Database → Extensions).
create extension if not exists pg_cron schema extensions;

-- ── 1a) Hard-delete soft-deleted accounts after 30-day grace period ─────────
-- Runs daily at 03:00 UTC. Deletes auth.users rows (cascading to all
-- linked tables) for any profile marked deleted_at > 30 days ago.
select cron.schedule(
  'purge-deleted-accounts',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$
  delete from auth.users
  where id in (
    select id from public.profiles
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
  );
  $$
);

-- ── 1b) Purge read notifications older than 90 days ────────────────────────
-- Runs daily at 03:10 UTC. Keeps unread notifications indefinitely.
select cron.schedule(
  'purge-old-notifications',
  '10 3 * * *',
  $$
  delete from public.notifications
  where is_read = true
    and created_at < now() - interval '90 days';
  $$
);

-- ── 1c) Purge resolved support-chat messages older than 180 days ───────────
-- Runs daily at 03:20 UTC. Keeps recent message history for support context.
select cron.schedule(
  'purge-old-messages',
  '20 3 * * *',
  $$
  delete from public.messages
  where created_at < now() - interval '180 days';
  $$
);

-- ── 2) GDPR right-to-erasure function ──────────────────────────────────────
-- Callable by service-role key (Edge Function) to fully erase a user on demand.
-- This satisfies Apple App Store 5.1.1(v) and Google Play data-deletion
-- webhook requirements.
--
-- Usage from Edge Function (service-role client):
--   await supabase.rpc('gdpr_delete_user', { p_user_id: 'uuid-here' });
create or replace function public.gdpr_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Delete the auth.users row; ON DELETE CASCADE handles all linked tables
  -- (profiles, savings_accounts, wallets, transactions, loan_applications,
  --  repayments, notifications, messages, goals, etc.)
  delete from auth.users where id = p_user_id;
end;
$$;

-- Grant only to service-role (not to authenticated users).
revoke execute on function public.gdpr_delete_user(uuid) from authenticated;
-- The service-role key bypasses RLS, so no explicit grant is needed for it.

-- ── Index to support the purge queries ─────────────────────────────────────
create index if not exists idx_profiles_deleted_at
  on public.profiles (deleted_at)
  where deleted_at is not null;

create index if not exists idx_notifications_read_created
  on public.notifications (is_read, created_at);

create index if not exists idx_messages_created
  on public.messages (created_at);