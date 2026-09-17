-- FLOW — Quadro do dia + 4 tipos de ocorrência
-- Rode este script se o 0012 antigo (flow_team_headcount global) já foi aplicado.
-- Quem nunca rodou o 0012 pode usar só o 0012 reescrito.
-- Rodar no Supabase do FLOW (não no Card+).

drop table if exists public.flow_team_headcount;

create table if not exists public.flow_attendance_days (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  date_key text not null,
  operacao integer not null default 0,
  vendedor integer not null default 0,
  caixa integer not null default 0,
  estoque integer not null default 0,
  auxiliar integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_attendance_days_date_check
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_attendance_days_counts_check
    check (
      operacao between 0 and 999
      and vendedor between 0 and 999
      and caixa between 0 and 999
      and estoque between 0 and 999
      and auxiliar between 0 and 999
    ),
  constraint flow_attendance_days_store_date unique (cardplus_store_id, date_key)
);

create index if not exists flow_attendance_days_store_date_idx
  on public.flow_attendance_days (cardplus_store_id, date_key);

comment on table public.flow_attendance_days is
  'Quadro numérico do dia por unidade. Sem nomes. cardplus_store_id = stores.id do Card+.';

create table if not exists public.flow_attendance_events (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  date_key text not null,
  cardplus_collaborator_id uuid not null,
  collaborator_name text not null,
  kind text not null,
  justified boolean not null default false,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_attendance_events_date_check
    check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_attendance_events_kind_check
    check (kind in ('ATESTADO', 'FALTA', 'FALTA_JUSTIFICADA', 'BANCO_HORAS')),
  constraint flow_attendance_events_note_check
    check (note is null or char_length(note) <= 280),
  constraint flow_attendance_events_name_check
    check (char_length(collaborator_name) between 1 and 120),
  constraint flow_attendance_events_unique
    unique (cardplus_store_id, date_key, cardplus_collaborator_id)
);

alter table public.flow_attendance_events
  drop constraint if exists flow_attendance_events_kind_check;

alter table public.flow_attendance_events
  add constraint flow_attendance_events_kind_check
    check (kind in ('ATESTADO', 'FALTA', 'FALTA_JUSTIFICADA', 'BANCO_HORAS'));

update public.flow_attendance_events
  set kind = 'FALTA_JUSTIFICADA'
  where kind = 'FALTA' and justified = true;

alter table public.flow_attendance_days enable row level security;
alter table public.flow_attendance_events enable row level security;

drop policy if exists flow_attendance_days_deny_anon on public.flow_attendance_days;
create policy flow_attendance_days_deny_anon
  on public.flow_attendance_days for all to anon using (false) with check (false);

drop policy if exists flow_attendance_events_deny_anon on public.flow_attendance_events;
create policy flow_attendance_events_deny_anon
  on public.flow_attendance_events for all to anon using (false) with check (false);

drop policy if exists flow_attendance_days_select on public.flow_attendance_days;
create policy flow_attendance_days_select
  on public.flow_attendance_days for select to authenticated using (true);

drop policy if exists flow_attendance_events_select on public.flow_attendance_events;
create policy flow_attendance_events_select
  on public.flow_attendance_events for select to authenticated using (true);

grant select on public.flow_attendance_days to authenticated;
grant select on public.flow_attendance_events to authenticated;
