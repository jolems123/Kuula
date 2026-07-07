-- ============================================================================
-- 0006 — Production security & bottom-line hardening.
--
-- Closes the holes found in the final production review:
--
--   1. PRIVILEGE ESCALATION AT SIGNUP — handle_new_user() copied `role` from
--      raw_user_meta_data, which the CLIENT controls at signUp(). Anyone could
--      register as 'admin' (read every customer, approve real MarzPay loans to
--      themselves). Role is now always server-assigned 'user'; admins are
--      provisioned by the operator in SQL.
--
--   2. PRIVILEGE ESCALATION / CREDIT-SCORE GAMING VIA PROFILE UPDATE — the
--      "own profile update" policy had no WITH CHECK and no column limits, so
--      any user could UPDATE their own row to role='admin', verified=true,
--      kyc_verified=true, crb_status='clean', momo_months/loans_repaid=…,
--      inflating their credit score and unlocking the admin surface. Updates
--      are now limited (column-level grant) to contact/identity fields only.
--
--   3. ACCOUNT DELETION SILENTLY BROKEN — the client soft-deletes by setting
--      profiles.deleted_at, but the column never existed, so Apple 5.1.1(v)
--      account deletion was a no-op. Column added.
--
--   4. LEDGER FORGERY — the "transactions write" policy let any user INSERT
--      arbitrary rows (any type/amount, status 'completed') into the ledger,
--      corrupting the investor report and, worse, planting a large 'pending'
--      loan_payment row that a real webhook callback lacking a provider ref
--      could settle (findPendingTxn falls back to loan_id), crediting a big
--      repayment for a tiny real payment. Since 0004 every legitimate ledger
--      write happens in SECURITY DEFINER functions / service-role Edge
--      Functions, so direct client inserts are simply revoked.
--
--   5. FREE MONEY MINTING — topup_wallet() credited the wallet with no real
--      payment behind it, and pay_repayment() marked REAL loans paid from that
--      phantom balance (with a completed ledger row). A borrower could wipe
--      their debt for free. Both wallet-simulation RPCs are revoked from end
--      users; real repayments flow exclusively through marzpay-collect →
--      marzpay-webhook, which settles only on a confirmed provider callback.
--
--   6. PHANTOM DISBURSEMENT DOUBLE-COUNT — on_loan_decision credited the
--      in-app wallet with the principal at approval while marzpay-disburse
--      sent the same principal as REAL mobile money. auto-collect would later
--      "repay" the loan from that phantom wallet credit, so interest was never
--      actually collected. The trigger now only books the repayment schedule;
--      money movement is MarzPay's job.
--
--   7. LOST-UPDATE RACE IN SAVINGS — adjust_savings() read the balance and
--      wrote an absolute value with no row lock, so two concurrent withdrawals
--      could each pass the balance check and both be paid out. The row is now
--      locked FOR UPDATE.
--
--   8. CROSS-USER MESSAGING — the "messages send" policy only checked the
--      sender, so any user could DM any other user (spam/phishing surface).
--      Customers may now only message admins; admins may message anyone.
--
-- Additive over 0001–0005. Apply with: supabase db push (or SQL editor).
-- ============================================================================

-- ── 1) Signup never grants admin ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone, email)
  values (
    new.id,
    'user', -- role is server-assigned; client metadata is untrusted
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

-- ── 2+3) Profiles: soft-delete column + column-restricted self-updates ──────
alter table public.profiles add column if not exists deleted_at timestamptz;

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Column-level grant: users may edit contact/identity fields and request
-- deletion — never role, verified, kyc_verified, crb_status, or any
-- credit-scoring input. (Those change only via service-role / SQL.)
revoke update on public.profiles from authenticated;
grant update (full_name, phone, email, national_id, district, occupation, deleted_at)
  on public.profiles to authenticated;

-- ── 4) Ledger is server-write-only ───────────────────────────────────────────
drop policy if exists "transactions write" on public.transactions;

-- ── 5) Retire the wallet-simulation money paths for end users ────────────────
revoke execute on function public.pay_repayment(bigint) from authenticated;
revoke execute on function public.topup_wallet(bigint)  from authenticated;

-- ── 6) Loan approval books the schedule; MarzPay moves the money ─────────────
create or replace function public.handle_loan_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and coalesce(old.status,'') <> 'approved' then
    new.decided_at := now();
    new.loan_id := 'LN-' || substr(new.id::text, 1, 8);
    new.disbursement_ref := upper(substr(new.channel,1,3)) || '-' || upper(substr(md5(random()::text),1,8));
    -- No wallet credit here: the principal is disbursed as real mobile money by
    -- marzpay-disburse (which flips the status that fires this trigger).
    insert into public.repayments (loan_id, user_id, total, due_date)
    values (new.loan_id, new.applicant_id, new.total, now() + (new.term_days || ' days')::interval);
  elsif new.status = 'rejected' and coalesce(old.status,'') <> 'rejected' then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

-- ── 7) Savings adjustments are serialized per account ────────────────────────
create or replace function public.adjust_savings(p_delta bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance bigint;
  v_next    bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Amount must be non-zero' using errcode = '22023';
  end if;

  -- Row lock: concurrent withdrawals serialize here instead of both passing
  -- the balance check (lost-update / double-withdrawal race).
  select balance into v_balance
  from public.savings_accounts
  where user_id = v_uid
  for update;
  if v_balance is null then
    raise exception 'Savings account not found' using errcode = 'P0002';
  end if;

  v_next := v_balance + p_delta;
  if v_next < 0 then
    raise exception 'Insufficient savings balance' using errcode = '22023';
  end if;

  update public.savings_accounts
    set balance = v_next, updated_at = now()
    where user_id = v_uid;

  insert into public.transactions (user_id, type, amount, status)
  values (
    v_uid,
    case when p_delta > 0 then 'savings_deposit' else 'savings_withdrawal' end,
    abs(p_delta),
    'completed'
  );

  return json_build_object('balance', v_next);
end;
$$;

-- ── 8) Customers message support (admins); admins message anyone ─────────────
drop policy if exists "messages send" on public.messages;
create policy "messages send" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.profiles r where r.id = receiver_id and r.role = 'admin')
    )
  );
