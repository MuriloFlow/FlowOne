-- FLOW -- Historico e avaliacoes do Kobbi
-- Rodar no Supabase do FLOW (nao no Card+).
--
-- Conversas: no maximo 5 por usuario (trigger + logica no processo principal).
-- Avaliacoes: boa / ruim, ligadas ao usuario (thread opcional).
-- Escrita operacional pelo main process (service_role). Authenticated so le o proprio.

create table if not exists public.flow_kobbi_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_kobbi_threads_title_check
    check (char_length(title) > 0 and char_length(title) <= 80),
  constraint flow_kobbi_threads_messages_check
    check (jsonb_typeof(messages) = 'array')
);

create index if not exists flow_kobbi_threads_user_created_idx
  on public.flow_kobbi_threads (user_id, created_at desc);

comment on table public.flow_kobbi_threads is
  'Ultimas conversas do Kobbi por usuario FLOW. Nao vai para o Card+.';

create table if not exists public.flow_kobbi_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.flow_kobbi_threads(id) on delete set null,
  message_hash text not null,
  excerpt text,
  rating text not null,
  created_at timestamptz not null default now(),
  constraint flow_kobbi_ratings_rating_check
    check (rating in ('good', 'bad')),
  constraint flow_kobbi_ratings_hash_check
    check (char_length(message_hash) >= 16 and char_length(message_hash) <= 64),
  constraint flow_kobbi_ratings_excerpt_check
    check (excerpt is null or char_length(excerpt) <= 120)
);

create index if not exists flow_kobbi_ratings_user_created_idx
  on public.flow_kobbi_ratings (user_id, created_at desc);

comment on table public.flow_kobbi_ratings is
  'Avalizacao Boa resposta / Resposta ruim do Kobbi. Sem PII alem do recorte curto da resposta.';

create or replace function public.flow_kobbi_threads_keep_five()
returns trigger
language plpgsql
as $$
begin
  delete from public.flow_kobbi_threads
  where user_id = new.user_id
    and id not in (
      select id
      from public.flow_kobbi_threads
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists flow_kobbi_threads_keep_five on public.flow_kobbi_threads;
create trigger flow_kobbi_threads_keep_five
  after insert or update of user_id on public.flow_kobbi_threads
  for each row
  execute function public.flow_kobbi_threads_keep_five();

alter table public.flow_kobbi_threads enable row level security;
alter table public.flow_kobbi_ratings enable row level security;

drop policy if exists flow_kobbi_threads_deny_anon on public.flow_kobbi_threads;
create policy flow_kobbi_threads_deny_anon
  on public.flow_kobbi_threads for all to anon using (false) with check (false);

drop policy if exists flow_kobbi_ratings_deny_anon on public.flow_kobbi_ratings;
create policy flow_kobbi_ratings_deny_anon
  on public.flow_kobbi_ratings for all to anon using (false) with check (false);

drop policy if exists flow_kobbi_threads_select_own on public.flow_kobbi_threads;
create policy flow_kobbi_threads_select_own
  on public.flow_kobbi_threads for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists flow_kobbi_ratings_select_own on public.flow_kobbi_ratings;
create policy flow_kobbi_ratings_select_own
  on public.flow_kobbi_ratings for select to authenticated
  using (auth.uid() = user_id);

grant select on public.flow_kobbi_threads to authenticated;
grant select on public.flow_kobbi_ratings to authenticated;
