-- ============================================================================
-- FLOW 0023 — Portal do RH + correção do fluxo de senha
-- 1) Leitura PÚBLICA de perguntas ATIVAS (formulário do candidato precisa
--    listar perguntas globais + da vaga com anon; o RH edita via RLS admin).
-- 2) Índice de sessões revogadas — acelera a checagem de redefinição de senha.
-- 3) FIX DA ORIGEM: flow_auth_set_own_password rodava com search_path=public,
--    mas gen_salt/crypt (pgcrypto) vivem no schema "extensions" → o funcionário
--    recebia "function gen_salt(unknown) does not exist" e NUNCA conseguia
--    salvar a senha definitiva após a temporária. Recriada com o search_path
--    correto (mesma assinatura e lógica).
-- 100% aditivo e idempotente. Nada existente é alterado ou removido.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Perguntas ativas legíveis para o portal público (anon).
-- ---------------------------------------------------------------------------
drop policy if exists rh_questions_public_select_active on public.rh_questions;
create policy rh_questions_public_select_active
  on public.rh_questions
  for select
  to anon
  using (active = true);

drop policy if exists rh_options_public_select_active on public.rh_options;
create policy rh_options_public_select_active
  on public.rh_options
  for select
  to anon
  using (
    exists (
      select 1 from public.rh_questions q
      where q.id = question_id and q.active = true
    )
  );

grant select on table public.rh_options to anon;

-- ---------------------------------------------------------------------------
-- 2) Índice para revogação/validação de sessões por usuário (fluxo de senha).
-- ---------------------------------------------------------------------------
create index if not exists flow_sessions_user_revoked_idx
  on public.flow_sessions (user_id, revoked_at);

-- ---------------------------------------------------------------------------
-- 3) RPC de senha definitiva com search_path correto (public + extensions).
-- ---------------------------------------------------------------------------
create or replace function public.flow_auth_set_own_password(p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
  'Usuário autenticado define a própria senha (primeiro acesso/redefinição). Limpa must_set_password. search_path inclui extensions p/ gen_salt/crypt.';

-- ============================================================================
-- FIM — nada existente foi modificado.
-- ============================================================================
