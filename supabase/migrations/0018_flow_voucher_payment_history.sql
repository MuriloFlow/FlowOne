-- FLOW — Histórico semanal dos vales pagos (um domingo = um lote).
-- O quadro atual continua em flow_employee_vouchers e volta a pendente no sábado 00:00.
-- Execute no SQL Editor do Supabase FLOW.

create table if not exists public.flow_voucher_payment_history (
  id uuid primary key default gen_random_uuid(),
  cardplus_collaborator_id uuid not null,
  period_key text not null,
  cardplus_store_id uuid,
  name text not null,
  store_name text not null default '',
  role_label text not null default '',
  lunch_cents integer not null default 0,
  transport_cents integer not null default 0,
  paid_at timestamptz,
  receipt_number text,
  created_at timestamptz not null default now(),
  constraint flow_voucher_payment_history_period_check
    check (period_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_voucher_payment_history_amounts_check
    check (lunch_cents >= 0 and transport_cents >= 0),
  constraint flow_voucher_payment_history_unique
    unique (cardplus_collaborator_id, period_key)
);

comment on table public.flow_voucher_payment_history is
  'Pagamentos de vale já fechados, um registro por funcionário e domingo. Não é apagado no reset de sábado.';

create index if not exists flow_voucher_payment_history_period_idx
  on public.flow_voucher_payment_history (period_key, name);

alter table public.flow_voucher_payment_history enable row level security;

drop policy if exists flow_voucher_payment_history_deny_anon on public.flow_voucher_payment_history;
create policy flow_voucher_payment_history_deny_anon
  on public.flow_voucher_payment_history
  for all to anon
  using (false) with check (false);

drop policy if exists flow_voucher_payment_history_select_authenticated on public.flow_voucher_payment_history;
create policy flow_voucher_payment_history_select_authenticated
  on public.flow_voucher_payment_history
  for select to authenticated
  using (true);

grant select on public.flow_voucher_payment_history to authenticated;
