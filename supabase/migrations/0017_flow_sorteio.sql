-- FLOW — Sorteio / cadastro de clientes e vales (chances).
-- Execute no SQL Editor do projeto Supabase FLOW antes de usar a aba Sorteio.

create table if not exists public.flow_sorteio_clients (
  id uuid primary key default gen_random_uuid(),
  cpf_digits text not null,
  name text not null,
  phone_digits text not null,
  created_store_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_sorteio_clients_cpf_check
    check (cpf_digits ~ '^\d{11}$'),
  constraint flow_sorteio_clients_name_check
    check (char_length(trim(name)) between 2 and 120),
  constraint flow_sorteio_clients_phone_check
    check (phone_digits ~ '^\d{10,11}$'),
  constraint flow_sorteio_clients_cpf_unique unique (cpf_digits)
);

comment on table public.flow_sorteio_clients is
  'Clientes do sorteio FLOW. CPF único na rede; vales (chances) ficam em flow_sorteio_vales.';

create table if not exists public.flow_sorteio_vales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.flow_sorteio_clients (id) on delete cascade,
  cardplus_store_id uuid not null,
  vale_type text not null,
  vale_label text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint flow_sorteio_vales_type_check
    check (vale_type in ('LEVOU_2', 'COMPRA_150', 'OUTRO')),
  constraint flow_sorteio_vales_label_check
    check (char_length(trim(vale_label)) between 2 and 80)
);

comment on table public.flow_sorteio_vales is
  'Cada vale = 1 chance no sorteio. cardplus_store_id é a unidade Card+ onde o vale foi gerado.';

create index if not exists flow_sorteio_vales_client_idx
  on public.flow_sorteio_vales (client_id, created_at desc);

create index if not exists flow_sorteio_vales_store_idx
  on public.flow_sorteio_vales (cardplus_store_id, created_at desc);

create index if not exists flow_sorteio_clients_name_idx
  on public.flow_sorteio_clients (name);

alter table public.flow_sorteio_clients enable row level security;
alter table public.flow_sorteio_vales enable row level security;

drop policy if exists flow_sorteio_clients_deny_anon on public.flow_sorteio_clients;
create policy flow_sorteio_clients_deny_anon
  on public.flow_sorteio_clients
  for all to anon
  using (false) with check (false);

drop policy if exists flow_sorteio_clients_select_authenticated on public.flow_sorteio_clients;
create policy flow_sorteio_clients_select_authenticated
  on public.flow_sorteio_clients
  for select to authenticated
  using (true);

drop policy if exists flow_sorteio_vales_deny_anon on public.flow_sorteio_vales;
create policy flow_sorteio_vales_deny_anon
  on public.flow_sorteio_vales
  for all to anon
  using (false) with check (false);

drop policy if exists flow_sorteio_vales_select_authenticated on public.flow_sorteio_vales;
create policy flow_sorteio_vales_select_authenticated
  on public.flow_sorteio_vales
  for select to authenticated
  using (true);

grant select on public.flow_sorteio_clients to authenticated;
grant select on public.flow_sorteio_vales to authenticated;
