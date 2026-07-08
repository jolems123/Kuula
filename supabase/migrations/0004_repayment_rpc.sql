-- ============================================================================
-- Server-authoritative money movement (repayments, wallet top-ups, savings).
--
-- Moves every balance mutation off the client and into atomic, validated
-- SECURITY DEFINER functions, then locks down RLS so authenticated users can
-- only READ their wallet / savings / repayment rows — never write them
-- directly. The client may only REQUEST an operation; the server decides the
-- amount actually moved, enforces balances, and records a ledger row.
--
-- Row creation is unaffected: wallets/savings rows come from the
-- handle_new_user() trigger and repayments from the on_loan_decision() trigger
-- (both SECURITY DEFINER), so they bypass the tightened RLS below.
--
-- Also fixes a latent bug: the old client code updated a non-existent `loans`
-- table; the correct target is `loan_applications` (status 'paid' added in 0002).
--
-- Additive over 0001-0003. Apply with: supabase db push (or paste into SQL editor).
-- ============================================================================

-- Allow a wallet top-up to be recorded in the ledger (additive to 0002 types).
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in ('loan_disbursement','loan_payment','savings_deposit','savings_withdrawal','wallet_topup'));

-- ── Repayment ───────────────────────────────────────────────────────────────
create or replace function public.pay_repayment(p_amount bigint default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_rep         public.repayments%rowtype;
  v_balance     bigint;
  v_outstanding bigint;
  v_pay         bigint;
  v_new_paid    bigint;
  v_success     boolean;
  v_partial     boolean;
  v_receipt     text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- The caller's active (unpaid) repayment, soonest due first. Never trusts a
  -- client-supplied id, and skips already-settled rows.
  select * into v_rep
  from public.repayments
  where user_id = v_uid
    and status <> 'paid'
  order by due_date asc, created_at asc
  limit 1;

  if v_rep.id is null then
    return json_build_object(
      'repayment', null,
      'attempt', json_build_object('success', false, 'reason', 'no-active-loan'),
      'isPartial', false
    );
  end if;

  select balance into v_balance from public.wallets where user_id = v_uid;
  v_balance     := coalesce(v_balance, 0);
  v_outstanding := v_rep.total - v_rep.amount_paid;

  -- Server clamps the requested amount; it never trusts the client figure.
  if p_amount is null then
    v_pay := v_outstanding;
  else
    v_pay := least(greatest(p_amount, 0), v_outstanding);
  end if;

  v_success := v_balance >= v_pay and v_pay > 0;
  v_partial := v_pay < v_outstanding;

  if v_success then
    v_new_paid := v_rep.amount_paid + v_pay;
    v_receipt  := 'RCPT-' || (extract(epoch from now()) * 1000)::bigint;

    update public.wallets
      set balance = balance - v_pay
      where user_id = v_uid;

    if v_new_paid >= v_rep.total then
      update public.repayments
        set status = 'paid', amount_paid = v_rep.total, receipt_id = v_receipt
        where id = v_rep.id;
      update public.loan_applications
        set status = 'paid'
        where loan_id = v_rep.loan_id and applicant_id = v_uid;
      v_rep.status      := 'paid';
      v_rep.amount_paid := v_rep.total;
    else
      update public.repayments
        set amount_paid = v_new_paid, receipt_id = v_receipt
        where id = v_rep.id;
      v_rep.amount_paid := v_new_paid;
    end if;

    v_rep.receipt_id := v_receipt;

    insert into public.transactions (user_id, loan_id, type, amount, status)
    values (v_uid, v_rep.loan_id, 'loan_payment', v_pay, 'completed');
  end if;

  return json_build_object(
    'repayment', row_to_json(v_rep),
    'attempt', json_build_object(
      'success', v_success,
      'reason', case
        when v_success then (case when v_partial then 'partial-payment-collected' else 'collected' end)
        else 'insufficient-wallet-balance'
      end
    ),
    'isPartial', v_partial
  );
end;
$$;

-- ── Wallet top-up ───────────────────────────────────────────────────────────
create or replace function public.topup_wallet(p_amount bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Top-up amount must be positive' using errcode = '22023';
  end if;

  update public.wallets
    set balance = balance + p_amount
    where user_id = v_uid
    returning balance into v_balance;

  if v_balance is null then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  insert into public.transactions (user_id, type, amount, status)
  values (v_uid, 'wallet_topup', p_amount, 'completed');

  return json_build_object('balance', v_balance);
end;
$$;

-- ── Savings deposit / withdrawal ────────────────────────────────────────────
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

  select balance into v_balance from public.savings_accounts where user_id = v_uid;
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

-- ── Grants: authenticated end-users only; never anon or public ──────────────
revoke all on function public.pay_repayment(bigint) from public;
revoke all on function public.topup_wallet(bigint)  from public;
revoke all on function public.adjust_savings(bigint) from public;
grant execute on function public.pay_repayment(bigint) to authenticated;
grant execute on function public.topup_wallet(bigint)  to authenticated;
grant execute on function public.adjust_savings(bigint) to authenticated;

-- ── Lock down RLS: owners may READ their money rows, never write them ────────
-- All writes now flow through the SECURITY DEFINER functions/triggers above,
-- which run as the function owner and bypass these policies.
drop policy if exists "wallet owner rw"          on public.wallets;
drop policy if exists "savings owner rw"         on public.savings_accounts;
drop policy if exists "repayments owner write"   on public.repayments;

create policy "wallet owner read"  on public.wallets
  for select using (user_id = auth.uid());
create policy "savings owner read" on public.savings_accounts
  for select using (user_id = auth.uid());
-- (repayments already has a "repayments read" owner/admin SELECT policy.)
