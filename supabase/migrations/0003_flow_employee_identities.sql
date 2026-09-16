-- FLOW — Identidade complementar do funcionário
-- Rodar no Supabase do FLOW (não no Card+).
--
-- Tabela: public.flow_employee_identities
-- Finalidade: guardar CPF e cargo FLOW de funcionários que já existem no Card+.
-- Relacionamento: cardplus_collaborator_id = collaborators.id do banco Card+.
--   Sem FK física porque os bancos são projetos Supabase diferentes.
-- Campos:
--   id                         uuid pk
--   cardplus_collaborator_id   uuid unique  — vínculo com Card+
--   cpf_digits                 text null    — 11 dígitos; nunca vai para o Card+
--   flow_role                  text         — cargo FLOW (Operador, Gerente, ...)
--   created_at / updated_at    timestamptz
-- Índices: unique(cardplus_collaborator_id), unique(cpf_digits)
-- Permissões: RLS ligado; escrita operacional só pelo processo principal (service_role)
-- Auditoria: insert em flow_audit_logs na ação employee.identity.upsert

create table if not exists public.flow_employee_identities (
  id uuid primary key default gen_random_uuid(),
  cardplus_collaborator_id uuid not null unique,
  cpf_digits text,
  flow_role text not null default 'OPERADOR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_employee_identities_cpf_check
    check (cpf_digits is null or cpf_digits ~ '^[0-9]{11}$'),
  constraint flow_employee_identities_role_check
    check (flow_role in (
      'OPERADOR',
      'ESTOQUISTA',
      'LIDER_OPERACAO',
      'LIDER_ESTOQUE',
      'LIDER_CAIXA',
      'GERENTE',
      'GERENTE_GERAL',
      'SUPERVISOR',
      'DIRETOR'
    ))
);

create unique index if not exists flow_employee_identities_cpf_unique
  on public.flow_employee_identities (cpf_digits)
  where cpf_digits is not null;

comment on table public.flow_employee_identities is
  'CPF e cargo FLOW ligados ao colaborador do Card+. Não duplica cartões, metas ou cadastro operacional.';

comment on column public.flow_employee_identities.cardplus_collaborator_id is
  'UUID do colaborador no Supabase do Card+ (tabela collaborators).';

comment on column public.flow_employee_identities.cpf_digits is
  'CPF apenas com 11 dígitos. Dado exclusivo do FLOW.';

alter table public.flow_employee_identities enable row level security;

drop policy if exists flow_employee_identities_deny_anon on public.flow_employee_identities;
create policy flow_employee_identities_deny_anon
  on public.flow_employee_identities
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists flow_employee_identities_select_authenticated on public.flow_employee_identities;
create policy flow_employee_identities_select_authenticated
  on public.flow_employee_identities
  for select
  to authenticated
  using (true);

grant select on public.flow_employee_identities to authenticated;
