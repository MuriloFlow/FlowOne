-- FLOW — Política de releases e telemetria da frota.
-- Permite: forçar atualização mínima em desktop/mobile sem reinstalar nada
-- manualmente, e ver quais versões estão rodando em cada dispositivo.
-- Execute no SQL Editor do Supabase FLOW (ou via psql no VPS).

-- Política vigente: uma linha por plataforma ('DESKTOP' | 'MOBILE').
create table if not exists public.flow_release_policy (
  platform text primary key,
  min_version text not null default '0.0.0',
  message text,
  updated_at timestamptz not null default now(),
  constraint flow_release_policy_platform_check
    check (platform in ('DESKTOP', 'MOBILE'))
);

comment on table public.flow_release_policy is
  'Versão mínima obrigatória por plataforma. Quando o app reporta versão < min_version, ele recebe block=true e se atualiza antes de continuar.';

-- Um ping por dispositivo a cada login/check de atualização.
create table if not exists public.flow_device_pings (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  app_version text not null,
  device_label text,
  user_email text,
  session_id text,
  created_at timestamptz not null default now(),
  constraint flow_device_pings_platform_check
    check (platform in ('DESKTOP', 'MOBILE'))
);

comment on table public.flow_device_pings is
  'Telemetria de versões em uso: uma linha por ping (login ou checagem de update). Usada para conferir se a frota está na versão nova.';

create index if not exists flow_device_pings_created_idx
  on public.flow_device_pings (created_at desc);

create index if not exists flow_device_pings_platform_idx
  on public.flow_device_pings (platform, created_at desc);

alter table public.flow_release_policy enable row level security;
alter table public.flow_device_pings enable row level security;

drop policy if exists flow_release_policy_deny_anon on public.flow_release_policy;
create policy flow_release_policy_deny_anon
  on public.flow_release_policy
  for all to anon
  using (false) with check (false);

drop policy if exists flow_device_pings_deny_anon on public.flow_device_pings;
create policy flow_device_pings_deny_anon
  on public.flow_device_pings
  for all to anon
  using (false) with check (false);

-- Política é pública para clientes autenticados (o app precisa ler antes de
-- qualquer operação); ping só insere.
drop policy if exists flow_release_policy_select_authenticated on public.flow_release_policy;
create policy flow_release_policy_select_authenticated
  on public.flow_release_policy
  for select to authenticated
  using (true);

drop policy if exists flow_device_pings_insert_authenticated on public.flow_device_pings;
create policy flow_device_pings_insert_authenticated
  on public.flow_device_pings
  for insert to authenticated
  with check (true);

grant select on public.flow_release_policy to authenticated;
grant insert on public.flow_device_pings to authenticated;
grant select, insert, update, delete on public.flow_release_policy to service_role, authenticator;
grant select, insert, update, delete on public.flow_device_pings to service_role, authenticator;

-- Linhas iniciais (sem bloqueio).
insert into public.flow_release_policy (platform, min_version, message)
values
  ('DESKTOP', '0.0.0', null),
  ('MOBILE', '0.0.0', null)
on conflict (platform) do nothing;
