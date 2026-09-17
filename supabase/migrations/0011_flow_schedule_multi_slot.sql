-- FLOW — mesma pessoa em vários horários do mesmo dia
-- Rodar no SQL Editor do Supabase do FLOW (não no Card+).
-- Só impede duplicar a pessoa no MESMO horário. Abertura + Intermediário no mesmo dia pode.

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'flow_schedule_assignments'
      and c.contype = 'u'
  loop
    execute format('alter table public.flow_schedule_assignments drop constraint if exists %I', rec.conname);
  end loop;
end $$;

drop index if exists public.flow_schedule_assignments_person_day_uidx;
drop index if exists public.flow_schedule_assignments_day_person_uidx;
drop index if exists public.flow_schedule_assignments_unique;

create unique index if not exists flow_schedule_assignments_unique
  on public.flow_schedule_assignments (cardplus_store_id, week_start, slot_id, cardplus_collaborator_id);
