-- FLOW — Overlay do total mensal de cartões
-- Rodar no Supabase do FLOW (não no Card+).
--
-- A loja tem um sistema próprio que pode invalidar cartões. O FLOW não apaga
-- lançamentos diários nem registros de funcionários. Esta tabela só guarda o
-- total correto a exibir em "Cartões do mês" (unidade + mês).
-- cardplus_store_id = stores.id do Card+. Sem FK física.

create table if not exists public.flow_card_total_overrides (
  id uuid primary key default gen_random_uuid(),
  cardplus_store_id uuid not null,
  month_key text not null,
  total integer not null,
  note text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_card_total_overrides_month_check
    check (month_key ~ '^\d{4}-\d{2}$'),
  constraint flow_card_total_overrides_total_check
    check (total >= 0 and total <= 999999),
  constraint flow_card_total_overrides_note_check
    check (note is null or char_length(note) <= 280),
  constraint flow_card_total_overrides_store_month unique (cardplus_store_id, month_key)
);

create index if not exists flow_card_total_overrides_store_month_idx
  on public.flow_card_total_overrides (cardplus_store_id, month_key);

comment on table public.flow_card_total_overrides is
  'Total mensal exibido de cartões por unidade. Overlay de UI; não altera records do Card+.';

alter table public.flow_card_total_overrides enable row level security;

drop policy if exists flow_card_total_overrides_deny_anon on public.flow_card_total_overrides;
create policy flow_card_total_overrides_deny_anon
  on public.flow_card_total_overrides for all to anon using (false) with check (false);

drop policy if exists flow_card_total_overrides_select on public.flow_card_total_overrides;
create policy flow_card_total_overrides_select
  on public.flow_card_total_overrides for select to authenticated using (true);

grant select on public.flow_card_total_overrides to authenticated;
