-- FLOW — Assinatura digital sincronizada (PC ↔ celular)
-- O PC gera uma sessão com um código de 4 dígitos; o celular entra com o
-- código, desenha a assinatura com o dedo e envia; o PC recebe em tempo real
-- (polling leve pela edge function flow-ops). Tudo passa pela edge (service
-- role): a tabela fica bloqueada para clientes diretas por RLS.
-- Execute no banco FLOW (flowone). Idempotente.

create table if not exists public.flow_signature_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting',
  created_by uuid,
  store_id uuid,
  collaborator_id uuid,
  collaborator_name text,
  amount_cents integer,
  aspect real not null default 2.2,
  strokes jsonb not null default '[]'::jsonb,
  owner_token text,
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  signed_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  constraint flow_signature_sessions_status_check
    check (status in ('waiting', 'linked', 'signed', 'confirmed', 'cancelled', 'expired')),
  constraint flow_signature_sessions_code_check
    check (code ~ '^\d{4}$')
);

create index if not exists flow_signature_sessions_expires_idx
  on public.flow_signature_sessions (expires_at);

create index if not exists flow_signature_sessions_owner_idx
  on public.flow_signature_sessions (owner_token);

comment on table public.flow_signature_sessions is
  'Sessoes efemeras de assinatura sincronizada entre o launcher desktop e o app mobile. Expiram em ~15 minutos.';

alter table public.flow_signature_sessions enable row level security;

drop policy if exists flow_signature_sessions_deny_anon on public.flow_signature_sessions;
create policy flow_signature_sessions_deny_anon
  on public.flow_signature_sessions
  for all to anon
  using (false) with check (false);

drop policy if exists flow_signature_sessions_deny_authenticated on public.flow_signature_sessions;
create policy flow_signature_sessions_deny_authenticated
  on public.flow_signature_sessions
  for all to authenticated
  using (false) with check (false);

-- Tabelas criadas fora do SQL Editor não herdam os default privileges:
grant select, insert, update, delete on table public.flow_signature_sessions to service_role;
grant select, insert, update, delete on table public.flow_signature_sessions to authenticated;
