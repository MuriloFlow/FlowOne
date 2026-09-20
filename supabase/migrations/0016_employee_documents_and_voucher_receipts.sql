-- FLOW — Documento RG do funcionário e recibo de pagamento assinado.
-- Execute este arquivo no SQL Editor do projeto Supabase FLOW antes de publicar o app.
-- Imagens ficam em data URL, tal como as fotos de atestado; nunca no Card+.

create table if not exists public.flow_employee_documents (
  cardplus_collaborator_id uuid primary key,
  rg_image text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_employee_documents_rg_image_check
    check (length(rg_image) between 32 and 1500000 and rg_image like 'data:image/%')
);

comment on table public.flow_employee_documents is
  'Foto do RG anexada ao colaborador do Card+. Acesso e escrita ocorrem somente pelos serviços autenticados do FLOW.';

alter table public.flow_employee_documents enable row level security;

drop policy if exists flow_employee_documents_deny_anon on public.flow_employee_documents;
create policy flow_employee_documents_deny_anon
  on public.flow_employee_documents
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists flow_employee_documents_select_authenticated on public.flow_employee_documents;
create policy flow_employee_documents_select_authenticated
  on public.flow_employee_documents
  for select
  to authenticated
  using (true);

grant select on public.flow_employee_documents to authenticated;

alter table public.flow_employee_vouchers
  add column if not exists payment_signature text,
  add column if not exists payment_signed_at timestamptz,
  add column if not exists receipt_number text;

alter table public.flow_employee_vouchers
  drop constraint if exists flow_employee_vouchers_payment_signature_check;

alter table public.flow_employee_vouchers
  add constraint flow_employee_vouchers_payment_signature_check
  check (
    payment_signature is null
    or (length(payment_signature) between 32 and 1500000 and payment_signature like 'data:image/png;base64,%')
  );

comment on column public.flow_employee_vouchers.payment_signature is
  'Assinatura desenhada pelo recebedor para o pagamento do vale no período vigente.';

create index if not exists flow_employee_vouchers_paid_signature_idx
  on public.flow_employee_vouchers (status, period_key)
  where payment_signature is not null;
