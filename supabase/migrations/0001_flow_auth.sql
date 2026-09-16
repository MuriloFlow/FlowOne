-- FLOW launcher auth layer
-- Finalidade: sessão, auditoria e primeiro acesso do launcher.
-- Não duplica dados de cartões/gerentes do sistema existente.
-- Rodar no SQL Editor do Supabase antes do primeiro login.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.flow_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'LIDER_OPERACAO',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_profiles_role_check
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
    )),
  constraint flow_profiles_status_check
    check (status in ('active', 'inactive', 'locked'))
);

comment on table public.flow_profiles is
  'Identidade FLOW ligada a auth.users. Não substitui cadastro operacional de funcionários.';

create table if not exists public.flow_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null unique,
  refresh_token_hash text not null,
  user_agent text,
  ip inet,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);

comment on table public.flow_sessions is
  'Sessões do launcher validadas no banco. Tokens crus nunca são persistidos.';

create table if not exists public.flow_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  success boolean not null,
  ip inet,
  user_agent text,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.flow_login_attempts is
  'Tentativas de login para auditoria e bloqueio temporário.';

create table if not exists public.flow_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.flow_audit_logs is
  'Auditoria imutável para usuários comuns. Sem update/delete via API.';

create index if not exists flow_sessions_user_id_idx on public.flow_sessions (user_id);
create index if not exists flow_sessions_expires_at_idx on public.flow_sessions (expires_at);
create index if not exists flow_login_attempts_email_created_idx
  on public.flow_login_attempts (email_normalized, created_at desc);
create index if not exists flow_audit_logs_user_id_created_idx
  on public.flow_audit_logs (user_id, created_at desc);
create index if not exists flow_audit_logs_action_created_idx
  on public.flow_audit_logs (action, created_at desc);

alter table public.flow_profiles enable row level security;
alter table public.flow_sessions enable row level security;
alter table public.flow_login_attempts enable row level security;
alter table public.flow_audit_logs enable row level security;

drop policy if exists flow_profiles_select_own on public.flow_profiles;
create policy flow_profiles_select_own
  on public.flow_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists flow_sessions_select_own on public.flow_sessions;
create policy flow_sessions_select_own
  on public.flow_sessions
  for select
  to authenticated
  using (user_id = auth.uid() and revoked_at is null);

drop policy if exists flow_audit_logs_select_own on public.flow_audit_logs;
create policy flow_audit_logs_select_own
  on public.flow_audit_logs
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on table public.flow_profiles to authenticated;
grant select on table public.flow_sessions to authenticated;
grant select on table public.flow_audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

create or replace function public.flow_normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

create or replace function public.flow_request_ip()
returns inet
language plpgsql
stable
as $$
declare
  headers jsonb;
  raw text;
begin
  begin
    headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;

  raw := split_part(
    coalesce(headers->>'x-forwarded-for', headers->>'x-real-ip', ''),
    ',',
    1
  );
  raw := btrim(raw);

  if raw ~ '^[0-9a-fA-F:.]+$' then
    begin
      return raw::inet;
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

create or replace function public.flow_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.flow_profiles (user_id, email, display_name, role, status)
  values (
    new.id,
    public.flow_normalize_email(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'LIDER_OPERACAO'),
    'active'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists flow_on_auth_user_created on auth.users;
create trigger flow_on_auth_user_created
  after insert on auth.users
  for each row execute function public.flow_handle_new_user();

create or replace function public.flow_auth_check_lockout(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := public.flow_normalize_email(p_email);
  failures integer := 0;
  locked boolean := false;
begin
  if normalized = '' or position('@' in normalized) = 0 then
    return jsonb_build_object('locked', false, 'failures', 0, 'retry_after_seconds', 0);
  end if;

  select count(*)
    into failures
  from public.flow_login_attempts
  where email_normalized = normalized
    and success = false
    and created_at > now() - interval '15 minutes';

  locked := failures >= 5;

  return jsonb_build_object(
    'locked', locked,
    'failures', failures,
    'retry_after_seconds', case when locked then 900 else 0 end
  );
end;
$$;

create or replace function public.flow_auth_record_attempt(
  p_email text,
  p_success boolean,
  p_reason text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := public.flow_normalize_email(p_email);
  parsed_ip inet;
  request_ip inet := public.flow_request_ip();
begin
  begin
    parsed_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    parsed_ip := null;
  end;

  insert into public.flow_login_attempts (
    email_normalized,
    success,
    ip,
    user_agent,
    reason
  ) values (
    normalized,
    coalesce(p_success, false),
    coalesce(parsed_ip, request_ip),
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_reason, ''), 300)
  );

  insert into public.flow_audit_logs (
    actor_email,
    action,
    entity_type,
    ip,
    user_agent,
    metadata
  ) values (
    normalized,
    case when p_success then 'login.success' else 'login.failure' end,
    'auth',
    coalesce(parsed_ip, request_ip),
    left(coalesce(p_user_agent, ''), 500),
    jsonb_build_object('reason', p_reason)
  );

  return public.flow_auth_check_lockout(normalized);
end;
$$;

create or replace function public.flow_auth_register_session(
  p_session_id text,
  p_refresh_token_hash text,
  p_user_agent text default null,
  p_ip text default null,
  p_device_label text default null,
  p_expires_at timestamptz default now() + interval '30 days'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  parsed_ip inet;
  request_ip inet := public.flow_request_ip();
  new_id uuid;
  extra_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null or length(p_session_id) < 16 then
    raise exception 'Invalid session id';
  end if;

  if p_refresh_token_hash is null or length(p_refresh_token_hash) < 32 then
    raise exception 'Invalid token hash';
  end if;

  begin
    parsed_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    parsed_ip := null;
  end;

  insert into public.flow_sessions (
    user_id,
    session_id,
    refresh_token_hash,
    user_agent,
    ip,
    device_label,
    expires_at
  ) values (
    current_user_id,
    p_session_id,
    p_refresh_token_hash,
    left(coalesce(p_user_agent, ''), 500),
    coalesce(parsed_ip, request_ip),
    left(coalesce(p_device_label, 'FLOW Launcher'), 120),
    coalesce(p_expires_at, now() + interval '30 days')
  )
  on conflict (session_id) do update
    set last_seen_at = now(),
        refresh_token_hash = excluded.refresh_token_hash,
        ip = excluded.ip,
        user_agent = excluded.user_agent,
        revoked_at = null,
        revoke_reason = null,
        expires_at = excluded.expires_at
  returning id into new_id;

  select array_agg(id)
    into extra_ids
  from (
    select id
    from public.flow_sessions
    where user_id = current_user_id
      and revoked_at is null
    order by last_seen_at desc
    offset 10
  ) oldest;

  if extra_ids is not null then
    update public.flow_sessions
      set revoked_at = now(),
          revoke_reason = 'session_limit'
    where id = any(extra_ids);
  end if;

  insert into public.flow_audit_logs (
    user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    ip,
    user_agent,
    metadata
  )
  select
    current_user_id,
    p.email,
    'session.register',
    'session',
    new_id::text,
    coalesce(parsed_ip, request_ip),
    left(coalesce(p_user_agent, ''), 500),
    jsonb_build_object('device_label', p_device_label)
  from public.flow_profiles p
  where p.user_id = current_user_id;

  return new_id;
end;
$$;

create or replace function public.flow_auth_validate_session(
  p_session_id text,
  p_refresh_token_hash text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_session public.flow_sessions%rowtype;
  current_profile public.flow_profiles%rowtype;
  parsed_ip inet;
  request_ip inet := public.flow_request_ip();
begin
  if current_user_id is null then
    return jsonb_build_object('valid', false, 'reason', 'unauthenticated');
  end if;

  select * into current_profile
  from public.flow_profiles
  where user_id = current_user_id;

  if current_profile.user_id is null or current_profile.status <> 'active' then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  select * into current_session
  from public.flow_sessions
  where session_id = p_session_id
    and user_id = current_user_id;

  if current_session.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if current_session.revoked_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;

  if current_session.expires_at < now() then
    update public.flow_sessions
      set revoked_at = now(),
          revoke_reason = 'expired'
    where id = current_session.id;
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  if current_session.refresh_token_hash <> p_refresh_token_hash then
    update public.flow_sessions
      set revoked_at = now(),
          revoke_reason = 'token_mismatch'
    where id = current_session.id;
    return jsonb_build_object('valid', false, 'reason', 'token_mismatch');
  end if;

  begin
    parsed_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    parsed_ip := null;
  end;

  update public.flow_sessions
    set last_seen_at = now(),
        ip = coalesce(parsed_ip, request_ip, ip),
        user_agent = coalesce(left(p_user_agent, 500), user_agent)
  where id = current_session.id;

  return jsonb_build_object(
    'valid', true,
    'session_id', current_session.session_id,
    'role', current_profile.role,
    'email', current_profile.email,
    'display_name', current_profile.display_name
  );
end;
$$;

create or replace function public.flow_auth_revoke_session(
  p_session_id text,
  p_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  update public.flow_sessions
    set revoked_at = now(),
        revoke_reason = left(coalesce(p_reason, 'logout'), 80)
  where session_id = p_session_id
    and user_id = current_user_id
    and revoked_at is null;

  insert into public.flow_audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    ip,
    metadata
  ) values (
    current_user_id,
    'session.revoke',
    'session',
    p_session_id,
    public.flow_request_ip(),
    jsonb_build_object('reason', p_reason)
  );

  return true;
end;
$$;

create or replace function public.flow_auth_audit(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  parsed_ip inet;
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  begin
    parsed_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    parsed_ip := null;
  end;

  insert into public.flow_audit_logs (
    user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    ip,
    user_agent,
    metadata
  )
  select
    current_user_id,
    p.email,
    left(p_action, 80),
    p_entity_type,
    p_entity_id,
    coalesce(parsed_ip, public.flow_request_ip()),
    left(coalesce(p_user_agent, ''), 500),
    coalesce(p_metadata, '{}'::jsonb)
  from public.flow_profiles p
  where p.user_id = current_user_id
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.flow_auth_check_lockout(text) from public;
revoke all on function public.flow_auth_record_attempt(text, boolean, text, text, text) from public;
revoke all on function public.flow_auth_register_session(text, text, text, text, text, timestamptz) from public;
revoke all on function public.flow_auth_validate_session(text, text, text, text) from public;
revoke all on function public.flow_auth_revoke_session(text, text) from public;
revoke all on function public.flow_auth_audit(text, text, text, jsonb, text, text) from public;

grant execute on function public.flow_auth_check_lockout(text) to anon, authenticated;
grant execute on function public.flow_auth_record_attempt(text, boolean, text, text, text) to anon, authenticated;
grant execute on function public.flow_auth_register_session(text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.flow_auth_validate_session(text, text, text, text) to authenticated;
grant execute on function public.flow_auth_revoke_session(text, text) to authenticated;
grant execute on function public.flow_auth_audit(text, text, text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Primeiro acesso
-- Email: murilogiroldo0@gmail.com
-- ---------------------------------------------------------------------------

do $$
declare
  new_user_id uuid;
begin
  select id into new_user_id
  from auth.users
  where email = 'murilogiroldo0@gmail.com';

  if new_user_id is null then
    new_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'murilogiroldo0@gmail.com',
      crypt('@Murilofe0911', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Murilo","role":"LIDER_OPERACAO"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      new_user_id,
      jsonb_build_object(
        'sub', new_user_id::text,
        'email', 'murilogiroldo0@gmail.com',
        'email_verified', true
      ),
      'email',
      new_user_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.flow_profiles (user_id, email, display_name, role, status)
  values (new_user_id, 'murilogiroldo0@gmail.com', 'Murilo', 'LIDER_OPERACAO', 'active')
  on conflict (user_id) do update
    set role = 'LIDER_OPERACAO',
        status = 'active',
        display_name = excluded.display_name,
        updated_at = now();
end;
$$;
