-- FLOW — Escalas e horários
-- Rodar no Supabase do FLOW (não no Card+).
-- Horários padrão: seg–qui abertura 8:20–16, inter 10:10–19, fechamento 12:25–21;
-- sexta ABT1/ABT2 + INTER + FECH1/FECH2; sábado com jornada estendida.
-- Por unidade o FLOW copia esses defaults e a loja pode personalizar.

create table if not exists public.flow_schedule_slot_defaults (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null,
  band text not null,
  code text not null,
  label text not null,
  start_minutes integer not null,
  end_minutes integer not null,
  sort_order integer not null,
  constraint flow_schedule_slot_defaults_weekday_check check (weekday between 1 and 7),
  constraint flow_schedule_slot_defaults_band_check
    check (band in ('ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO')),
  constraint flow_schedule_slot_defaults_minutes_check
    check (start_minutes >= 0 and end_minutes > start_minutes and end_minutes <= 24 * 60),
  constraint flow_schedule_slot_defaults_unique unique (weekday, code)
);

comment on table public.flow_schedule_slot_defaults is
  'Grade padrão de horários da escala. Copiada para cada unidade na primeira abertura.';

create table if not exists public.flow_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  weekday smallint not null,
  band text not null,
  code text not null,
  label text not null,
  start_minutes integer not null,
  end_minutes integer not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_schedule_slots_weekday_check check (weekday between 1 and 7),
  constraint flow_schedule_slots_band_check
    check (band in ('ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO')),
  constraint flow_schedule_slots_minutes_check
    check (start_minutes >= 0 and end_minutes > start_minutes and end_minutes <= 24 * 60),
  constraint flow_schedule_slots_unique unique (cardplus_store_id, weekday, code)
);

create index if not exists flow_schedule_slots_store_idx
  on public.flow_schedule_slots (cardplus_store_id, weekday, sort_order);

comment on table public.flow_schedule_slots is
  'Horários da escala por unidade. cardplus_store_id = stores.id do Card+. Sem FK física.';

create table if not exists public.flow_schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  week_start text not null,
  rolled_from_week text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_schedule_weeks_date_check check (week_start ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_schedule_weeks_unique unique (cardplus_store_id, week_start)
);

comment on table public.flow_schedule_weeks is
  'Semana da escala. Se rolled_from_week estiver preenchido, a grade veio automática da semana anterior.';

create table if not exists public.flow_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  week_start text not null,
  slot_id uuid not null references public.flow_schedule_slots (id) on delete cascade,
  weekday smallint not null,
  cardplus_collaborator_id uuid not null,
  sort_order integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_schedule_assignments_weekday_check check (weekday between 1 and 7),
  constraint flow_schedule_assignments_date_check check (week_start ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint flow_schedule_assignments_note_check check (note is null or char_length(note) <= 40),
  constraint flow_schedule_assignments_unique unique (cardplus_store_id, week_start, slot_id, cardplus_collaborator_id)
);

create index if not exists flow_schedule_assignments_week_idx
  on public.flow_schedule_assignments (cardplus_store_id, week_start, weekday, sort_order);

comment on table public.flow_schedule_assignments is
  'Quem está em cada horário da semana. cardplus_collaborator_id = collaborators.id do Card+.';

insert into public.flow_schedule_slot_defaults (weekday, band, code, label, start_minutes, end_minutes, sort_order)
values
  (1, 'ABERTURA', 'ABT', 'Abertura', 500, 960, 1),
  (1, 'INTERMEDIARIO', 'INTER', 'Intermediário', 610, 1140, 2),
  (1, 'FECHAMENTO', 'FECH', 'Fechamento', 745, 1260, 3),
  (2, 'ABERTURA', 'ABT', 'Abertura', 500, 960, 1),
  (2, 'INTERMEDIARIO', 'INTER', 'Intermediário', 610, 1140, 2),
  (2, 'FECHAMENTO', 'FECH', 'Fechamento', 745, 1260, 3),
  (3, 'ABERTURA', 'ABT', 'Abertura', 500, 960, 1),
  (3, 'INTERMEDIARIO', 'INTER', 'Intermediário', 610, 1140, 2),
  (3, 'FECHAMENTO', 'FECH', 'Fechamento', 745, 1260, 3),
  (4, 'ABERTURA', 'ABT', 'Abertura', 500, 960, 1),
  (4, 'INTERMEDIARIO', 'INTER', 'Intermediário', 610, 1140, 2),
  (4, 'FECHAMENTO', 'FECH', 'Fechamento', 745, 1260, 3),
  (5, 'ABERTURA', 'ABT1', 'Abertura 1', 470, 980, 1),
  (5, 'ABERTURA', 'ABT2', 'Abertura 2', 510, 1020, 2),
  (5, 'INTERMEDIARIO', 'INTER', 'Intermediário', 620, 1140, 3),
  (5, 'FECHAMENTO', 'FECH1', 'Fechamento 1', 745, 1260, 4),
  (5, 'FECHAMENTO', 'FECH2', 'Fechamento 2', 780, 1290, 5),
  (6, 'ABERTURA', 'ABT1', 'Abertura 1', 470, 1060, 1),
  (6, 'ABERTURA', 'ABT2', 'Abertura 2', 510, 1100, 2),
  (6, 'INTERMEDIARIO', 'INTER', 'Intermediário', 620, 1210, 3),
  (6, 'FECHAMENTO', 'FECH1', 'Fechamento 1', 670, 1260, 4),
  (6, 'FECHAMENTO', 'FECH2', 'Fechamento 2', 700, 1290, 5),
  (7, 'ABERTURA', 'ABT', 'Abertura', 500, 960, 1),
  (7, 'INTERMEDIARIO', 'INTER', 'Intermediário', 610, 1140, 2),
  (7, 'FECHAMENTO', 'FECH', 'Fechamento', 745, 1260, 3)
on conflict (weekday, code) do update
set
  band = excluded.band,
  label = excluded.label,
  start_minutes = excluded.start_minutes,
  end_minutes = excluded.end_minutes,
  sort_order = excluded.sort_order;

alter table public.flow_schedule_slot_defaults enable row level security;
alter table public.flow_schedule_slots enable row level security;
alter table public.flow_schedule_weeks enable row level security;
alter table public.flow_schedule_assignments enable row level security;

drop policy if exists flow_schedule_slot_defaults_deny_anon on public.flow_schedule_slot_defaults;
create policy flow_schedule_slot_defaults_deny_anon
  on public.flow_schedule_slot_defaults for all to anon using (false) with check (false);

drop policy if exists flow_schedule_slots_deny_anon on public.flow_schedule_slots;
create policy flow_schedule_slots_deny_anon
  on public.flow_schedule_slots for all to anon using (false) with check (false);

drop policy if exists flow_schedule_weeks_deny_anon on public.flow_schedule_weeks;
create policy flow_schedule_weeks_deny_anon
  on public.flow_schedule_weeks for all to anon using (false) with check (false);

drop policy if exists flow_schedule_assignments_deny_anon on public.flow_schedule_assignments;
create policy flow_schedule_assignments_deny_anon
  on public.flow_schedule_assignments for all to anon using (false) with check (false);

drop policy if exists flow_schedule_slot_defaults_select on public.flow_schedule_slot_defaults;
create policy flow_schedule_slot_defaults_select
  on public.flow_schedule_slot_defaults for select to authenticated using (true);

drop policy if exists flow_schedule_slots_select on public.flow_schedule_slots;
create policy flow_schedule_slots_select
  on public.flow_schedule_slots for select to authenticated using (true);

drop policy if exists flow_schedule_weeks_select on public.flow_schedule_weeks;
create policy flow_schedule_weeks_select
  on public.flow_schedule_weeks for select to authenticated using (true);

drop policy if exists flow_schedule_assignments_select on public.flow_schedule_assignments;
create policy flow_schedule_assignments_select
  on public.flow_schedule_assignments for select to authenticated using (true);

grant select on public.flow_schedule_slot_defaults to authenticated;
grant select on public.flow_schedule_slots to authenticated;
grant select on public.flow_schedule_weeks to authenticated;
grant select on public.flow_schedule_assignments to authenticated;
