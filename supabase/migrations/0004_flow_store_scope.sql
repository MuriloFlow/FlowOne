-- FLOW — Escopo por unidade
-- Rodar no Supabase do FLOW (não no Card+).
--
-- cardplus_store_id: unidade do Card+ (stores.id) para cargos que não veem a rede toda.
-- Supervisor e Diretor veem todas as unidades e filtram no launcher.
-- Demais cargos de login só veem a unidade vinculada.

alter table public.flow_profiles
  add column if not exists cardplus_store_id uuid;

comment on column public.flow_profiles.cardplus_store_id is
  'UUID da loja no Card+ (stores.id). Null só é permitido para Supervisor e Diretor.';

update public.flow_profiles
set
  role = 'SUPERVISOR',
  updated_at = now()
where lower(email) = 'murilogiroldo0@gmail.com';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'SUPERVISOR')
where lower(email) = 'murilogiroldo0@gmail.com';
