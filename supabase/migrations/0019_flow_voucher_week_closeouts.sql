-- FLOW — Finalização semanal dos vales (um domingo = um lote finalizado).
-- Guarda status da finalização, assinaturas e os dados necessários ao PDF,
-- para o estado sobreviver ao reset de sábado e ao restart do aplicativo.
-- Refinalizar é permitido: o upsert substitui o lote pelo mais recente.
-- Execute no SQL Editor do Supabase FLOW (ou via psql no VPS).

create table if not exists public.flow_voucher_week_closeouts (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  store_key text not null default 'ALL',
  finalized_at timestamptz not null default now(),
  finalized_by text,
  payments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_voucher_week_closeouts_period_check
    check (period_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_voucher_week_closeouts_unique
    unique (period_key, store_key)
);

comment on table public.flow_voucher_week_closeouts is
  'Lote finalizado de vales por domingo (e unidade). Preserva assinaturas e dados do PDF mesmo após o reset semanal ou restart do app.';

create index if not exists flow_voucher_week_closeouts_period_idx
  on public.flow_voucher_week_closeouts (period_key, store_key);

alter table public.flow_voucher_week_closeouts enable row level security;

drop policy if exists flow_voucher_week_closeouts_deny_anon on public.flow_voucher_week_closeouts;
create policy flow_voucher_week_closeouts_deny_anon
  on public.flow_voucher_week_closeouts
  for all to anon
  using (false) with check (false);

drop policy if exists flow_voucher_week_closeouts_select_authenticated on public.flow_voucher_week_closeouts;
create policy flow_voucher_week_closeouts_select_authenticated
  on public.flow_voucher_week_closeouts
  for select to authenticated
  using (true);

grant select on public.flow_voucher_week_closeouts to authenticated;
grant select, insert, update, delete on public.flow_voucher_week_closeouts to service_role, authenticator;
