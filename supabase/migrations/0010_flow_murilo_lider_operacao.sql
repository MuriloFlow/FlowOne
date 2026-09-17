-- FLOW — um cargo só para o Murilo Giroldo
-- Rodar no SQL Editor do Supabase do FLOW (não no Card+).
-- Lider de Operação vê a rede toda; cardplus_store_id pode ficar null.
-- Depois: reinicia o FLOW.

update public.flow_profiles
set
  role = 'LIDER_OPERACAO',
  display_name = 'Murilo Giroldo',
  email = coalesce(nullif(email, ''), 'murilogiroldo0@gmail.com'),
  status = 'active',
  updated_at = now()
where lower(email) = 'murilogiroldo0@gmail.com'
   or lower(coalesce(display_name, '')) in ('murilo', 'murilo giroldo');

update auth.users
set
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'LIDER_OPERACAO', 'full_name', 'Murilo Giroldo'),
  updated_at = now()
where lower(email) = 'murilogiroldo0@gmail.com';
