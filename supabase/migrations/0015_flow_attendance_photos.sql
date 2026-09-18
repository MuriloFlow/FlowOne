-- FLOW — Fotos do atestado (data URLs no evento)
-- Rodar no Supabase do FLOW (não no Card+).
-- Não altera RLS. Writes continuam via service role.

alter table public.flow_attendance_events
  add column if not exists photos jsonb not null default '[]'::jsonb;

comment on column public.flow_attendance_events.photos is
  'Array de data URL strings (data:image/...;base64,...) do atestado. Não usa Storage.';
