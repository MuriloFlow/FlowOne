-- FLOW — Notificações (cartões CARD+ e assinatura disponível) + preview PNG
-- da assinatura gerado no celular (fim da distorção no desktop).
-- Execute no VPS: docker exec -i supabase-db psql -U postgres -d flowone < este arquivo.

-- 1) Preview PNG da assinatura: o celular renderiza o PNG final (pixels
-- exatos desenhados) e manda junto no finish; o PC só exibe a imagem —
-- nunca re-renderiza os traços (era isso que distorcia no desktop).
alter table public.flow_signature_sessions
  add column if not exists preview_data_url text;

-- 2) Momento do último "abrir assinatura" (PC → celular). Com linked_at e
-- open_at o celular distingue, ao REABRIR o app (estava fechado), se há uma
-- assinatura pendente (linked_at <= open_at) ou se a rodada já fechou.
alter table public.flow_signature_sessions
  add column if not exists open_at timestamptz;

comment on column public.flow_signature_sessions.preview_data_url is
  'PNG (data URL) da assinatura renderizado no celular — fonte da verdade visual.';

-- 2) Central de notificações. Uma linha por evento; clientes pollem e mostram
-- notificação nativa (Electron Notification no desktop, LocalNotifications no
-- celular). dedupe_key impede duplicar o mesmo evento (índice único; null pode
-- repetir). Tabela fechada por RLS: só a edge/main (service role) toca nela.
create table if not exists public.flow_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  target text not null default 'ALL',
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  constraint flow_notifications_kind_check
    check (kind in ('cardplus_card', 'signature_available'))
);

comment on table public.flow_notifications is
  'Central de notificações push-in-app: cartões registrados no CARD+ e assinatura digital disponível no celular vinculado.';

create index if not exists flow_notifications_created_idx
  on public.flow_notifications (created_at desc);

alter table public.flow_notifications enable row level security;

revoke all on public.flow_notifications from anon, authenticated;
grant select, insert, update, delete on public.flow_notifications to service_role, authenticator;

-- Limpa notificações com mais de 7 dias (roda uma vez na migração; a edge
-- também limpa de tempos em tempos).
delete from public.flow_notifications where created_at < now() - interval '7 days';
