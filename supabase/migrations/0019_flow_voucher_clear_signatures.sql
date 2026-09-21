-- FLOW — Assinaturas de vale ficam só na sessão do app (PDF). Limpa o que ficou gravado antes.
update public.flow_employee_vouchers
set payment_signature = null,
    payment_signed_at = null
where payment_signature is not null;

comment on column public.flow_employee_vouchers.payment_signature is
  'Reservado. Assinaturas não são persistidas — só validadas na hora do pagamento e usadas no PDF da sessão.';
