-- Ajuste de cargos do FLOW.
-- Operador e Estoquista não acessam o launcher.
-- Demais cargos de gestão têm o mesmo acesso ao sistema.

alter table public.flow_profiles
  drop constraint if exists flow_profiles_role_check;

alter table public.flow_profiles
  alter column role set default 'LIDER_OPERACAO';

update public.flow_profiles
set role = case role
  when 'SUPER_ADMIN' then 'LIDER_OPERACAO'
  when 'ADMIN' then 'GERENTE_GERAL'
  when 'FUNCIONARIO' then 'OPERADOR'
  else role
end
where role in ('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO');

alter table public.flow_profiles
  add constraint flow_profiles_role_check
  check (role in (
    'OPERADOR',
    'ESTOQUISTA',
    'LIDER_OPERACAO',
    'LIDER_ESTOQUE',
    'LIDER_CAIXA',
    'GERENTE',
    'GERENTE_GERAL',
    'SUPERVISOR',
    'DIRETOR'
  ));

update public.flow_profiles
set role = 'LIDER_OPERACAO',
    display_name = coalesce(display_name, 'Murilo'),
    updated_at = now()
where email = 'murilogiroldo0@gmail.com';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || '{"role":"LIDER_OPERACAO","full_name":"Murilo"}'::jsonb,
    updated_at = now()
where email = 'murilogiroldo0@gmail.com';
