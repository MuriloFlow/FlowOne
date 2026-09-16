-- FLOW — Auxiliar + vales
-- Rodar no Supabase do FLOW (não no Card+).
--
-- 1) Cargo AUXILIAR em flow_profiles e flow_employee_identities
-- 2) Tabela flow_employee_vouchers
--    Finalidade: vale-almoço, vale-transporte e status semanal (Pendente/Pago)
--    Relacionamento: cardplus_collaborator_id = collaborators.id do Card+
--    Reset: todo domingo 00:00 (America/Sao_Paulo) PAGO volta para PENDENTE
--    Valores ficam; só o status reinicia.

alter table public.flow_profiles drop constraint if exists flow_profiles_role_check;
alter table public.flow_profiles
  add constraint flow_profiles_role_check
  check (role in (
    'OPERADOR',
    'ESTOQUISTA',
    'AUXILIAR',
    'LIDER_OPERACAO',
    'LIDER_ESTOQUE',
    'LIDER_CAIXA',
    'GERENTE',
    'GERENTE_GERAL',
    'SUPERVISOR',
    'DIRETOR'
  ));

alter table public.flow_employee_identities drop constraint if exists flow_employee_identities_role_check;
alter table public.flow_employee_identities
  add constraint flow_employee_identities_role_check
  check (flow_role in (
    'OPERADOR',
    'ESTOQUISTA',
    'AUXILIAR',
    'LIDER_OPERACAO',
    'LIDER_ESTOQUE',
    'LIDER_CAIXA',
    'GERENTE',
    'GERENTE_GERAL',
    'SUPERVISOR',
    'DIRETOR'
  ));

create table if not exists public.flow_employee_vouchers (
  id uuid primary key default gen_random_uuid(),
  cardplus_collaborator_id uuid not null unique,
  lunch_cents integer not null default 0 check (lunch_cents >= 0),
  transport_cents integer not null default 0 check (transport_cents >= 0),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PAGO')),
  period_key text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.flow_employee_vouchers is
  'Vales de almoço e transporte do FLOW. Não existe no Card+. Status reinicia todo domingo.';

alter table public.flow_employee_vouchers enable row level security;

drop policy if exists flow_employee_vouchers_deny_anon on public.flow_employee_vouchers;
create policy flow_employee_vouchers_deny_anon
  on public.flow_employee_vouchers
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists flow_employee_vouchers_select_authenticated on public.flow_employee_vouchers;
create policy flow_employee_vouchers_select_authenticated
  on public.flow_employee_vouchers
  for select
  to authenticated
  using (true);

grant select on public.flow_employee_vouchers to authenticated;
