-- FLOW — Rotação A/B/C dos domingos (2x1: 2 domingos trabalhados + 1 folga)
-- Rodar no Supabase do FLOW (não no Card+). Idempotente.
--
-- Guardamos a posição no ciclo em flow_employee_identities:
--   sunday_cycle       = 'A' | 'B' | 'C'  → posição de ABERTURA do ciclo
--   sunday_cycle_start = date             → primeiro domingo do ciclo atual
--
-- O gerente marca na tela Funcionários: "1° Domingo" ou "2° Domingo".
--   1° Domingo = a pessoa trabalha ESTE domingo e folga no PRÓXIMO
--     → cycle = primeiro domingo do ciclo atual (a semana em que ela trabalhou a 1ª vez)
--   2° Domingo = a pessoa trabalha ESTE domingo e no próximo também, folgando depois
--     → cycle = domingo da SEMANA PASSADA (o 1° dela foi lá)
--
-- A rotação em si é calculada no app (shared/schedules.ts): a cada domingo
-- completo dentro do ciclo a posição avança, e a folga cai no 3º domingo
-- (resto 2). Equipes que trabalham domingo: Operação, Vendas e Caixa.
-- Estoque e Auxiliar nunca são escalados no domingo.

alter table public.flow_employee_identities
  add column if not exists sunday_cycle text;

alter table public.flow_employee_identities
  add column if not exists sunday_cycle_start date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'flow_employee_identities_sunday_cycle_check'
  ) then
    alter table public.flow_employee_identities
      add constraint flow_employee_identities_sunday_cycle_check
      check (sunday_cycle is null or sunday_cycle in ('A', 'B', 'C'));
  end if;
end $$;

comment on column public.flow_employee_identities.sunday_cycle is
  'Posição de abertura do ciclo 2x1 dos domingos (A, B ou C). Nulo = fora da rotação (não trabalha domingo).';
comment on column public.flow_employee_identities.sunday_cycle_start is
  'Primeiro domingo do ciclo atual da pessoa. Sempre um domingo (ou nulo junto com sunday_cycle).';

alter table public.flow_employee_identities enable row level security;
