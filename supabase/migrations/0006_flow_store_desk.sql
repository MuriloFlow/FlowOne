-- FLOW — Mesa da unidade
-- Rodar no Supabase do FLOW (não no Card+).
--
-- O Card+ `stores` só tem id, name, created_at, updated_at.
-- Liderança, código interno, observação e flag de atenção ficam no FLOW.
-- Relacionamento: cardplus_store_id = stores.id do Card+. Sem FK física.

create table if not exists public.flow_store_profiles (
  cardplus_store_id uuid primary key,
  internal_code text,
  notes text,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_store_profiles_code_check
    check (internal_code is null or char_length(internal_code) <= 24),
  constraint flow_store_profiles_notes_check
    check (notes is null or char_length(notes) <= 2000)
);

comment on table public.flow_store_profiles is
  'Dados administrativos da unidade no FLOW. Não altera o cadastro operacional do Card+.';

create table if not exists public.flow_store_leadership (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  seat text not null,
  cardplus_collaborator_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_store_leadership_seat_check
    check (seat in ('GERENTE', 'GERENTE_GERAL', 'SUPERVISOR', 'LIDER_OPERACAO')),
  constraint flow_store_leadership_unique unique (cardplus_store_id, seat, cardplus_collaborator_id)
);

create unique index if not exists flow_store_leadership_single_seat
  on public.flow_store_leadership (cardplus_store_id, seat)
  where seat in ('GERENTE_GERAL', 'SUPERVISOR', 'LIDER_OPERACAO');

create index if not exists flow_store_leadership_store_idx
  on public.flow_store_leadership (cardplus_store_id);

comment on table public.flow_store_leadership is
  'Gerentes, gerente geral, supervisor e líder de operação da unidade. Vínculo com collaborators.id do Card+.';

alter table public.flow_store_profiles enable row level security;
alter table public.flow_store_leadership enable row level security;

drop policy if exists flow_store_profiles_deny_anon on public.flow_store_profiles;
create policy flow_store_profiles_deny_anon
  on public.flow_store_profiles for all to anon using (false) with check (false);

drop policy if exists flow_store_leadership_deny_anon on public.flow_store_leadership;
create policy flow_store_leadership_deny_anon
  on public.flow_store_leadership for all to anon using (false) with check (false);

drop policy if exists flow_store_profiles_select_authenticated on public.flow_store_profiles;
create policy flow_store_profiles_select_authenticated
  on public.flow_store_profiles for select to authenticated using (true);

drop policy if exists flow_store_leadership_select_authenticated on public.flow_store_leadership;
create policy flow_store_leadership_select_authenticated
  on public.flow_store_leadership for select to authenticated using (true);

grant select on public.flow_store_profiles to authenticated;
grant select on public.flow_store_leadership to authenticated;
