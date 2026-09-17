-- FLOW — Mesa financeira do dia
-- Rodar no Supabase do FLOW (não no Card+).
--
-- O Card+ daily_goals só tem prefixos confirmados:
--   YYYY-MM-DD          = meta diária de CARTÕES
--   month-cards:YYYY-MM = meta mensal de cartões
--   month-sales:YYYY-MM = meta mensal de valor (centavos)
--   daily-sale:YYYY-MM-DD = venda do dia (centavos)
-- Não há prefixo de meta diária de valor, last year nem PU.
-- daily_metrics tem total_customers / total_trocas / total_caixa — não é PU.
-- viradas_pu é log por colaborador, não o KPI digitado na mesa.
--
-- Venda do dia continua no Card+ (daily-sale). Meta do dia, last year e PU
-- ficam nesta tabela, por unidade e data.

create table if not exists public.flow_finance_days (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  date_key text not null,
  goal_cents integer,
  last_year_cents integer,
  pu numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_finance_days_date_key_check
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_finance_days_goal_check
    check (goal_cents is null or goal_cents >= 0),
  constraint flow_finance_days_last_year_check
    check (last_year_cents is null or last_year_cents >= 0),
  constraint flow_finance_days_pu_check
    check (pu is null or pu >= 0),
  constraint flow_finance_days_store_date unique (cardplus_store_id, date_key)
);

create index if not exists flow_finance_days_date_idx
  on public.flow_finance_days (date_key);

create index if not exists flow_finance_days_store_idx
  on public.flow_finance_days (cardplus_store_id);

comment on table public.flow_finance_days is
  'Meta do dia, last year e PU digitados no FLOW. A venda do dia permanece no Card+ daily-sale.';

alter table public.flow_finance_days enable row level security;

drop policy if exists flow_finance_days_deny_anon on public.flow_finance_days;
create policy flow_finance_days_deny_anon
  on public.flow_finance_days for all to anon using (false) with check (false);

drop policy if exists flow_finance_days_select_authenticated on public.flow_finance_days;
create policy flow_finance_days_select_authenticated
  on public.flow_finance_days for select to authenticated using (true);

grant select on public.flow_finance_days to authenticated;
