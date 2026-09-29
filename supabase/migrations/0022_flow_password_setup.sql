-- FLOW — Senha definida pelo próprio usuário (primeiro acesso + redefinição).
-- O gestor cria o acesso SEM senha (só e-mail) e pode REDEFINIR a senha quando
-- o funcionário esquecer. Nesses dois casos o usuário recebe uma senha
-- temporária e, ao logar, é obrigado a criar "Nova senha + Confirmar".
-- Execute no VPS: docker exec -i supabase-db psql -U postgres -d flowone < este arquivo.

-- 1) Flag: usuário precisa definir a própria senha no próximo login.
alter table public.flow_profiles
  add column if not exists must_set_password boolean not null default false;

comment on column public.flow_profiles.must_set_password is
  'true = senha temporária (primeiro acesso ou redefinição); o login exige criar nova senha.';

-- 2) RPC: o usuário LOGADO define a própria senha (tela "Nova senha").
-- SECURITY DEFINER porque precisa escrever em auth.users (só o serviço faz isso).
create or replace function public.flow_auth_set_own_password(p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sessão inválida.';
  end if;
  if p_new_password is null or length(trim(p_new_password)) < 8 or length(p_new_password) > 128 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  -- Hash bcrypt compatível com o GoTrue (mesmo formato do Supabase Auth).
  update auth.users
    set encrypted_password = crypt(trim(p_new_password), gen_salt('bf'))
    where id = v_user;
  update public.flow_profiles
    set must_set_password = false,
        updated_at = now()
    where user_id = v_user;
end;
$$;

revoke all on function public.flow_auth_set_own_password(text) from public, anon;
grant execute on function public.flow_auth_set_own_password(text) to authenticated;

comment on function public.flow_auth_set_own_password(text) is
  'Usuário autenticado define a própria senha (primeiro acesso/redefinição). Limpa must_set_password.';
