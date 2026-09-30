-- 0025: Fluxo de PRÉ-APROVADOS (contratado → onboarding) no Portal do RH.
--
-- Ao mover o candidato para "Contratado", ele aparece na aba Pré-Aprovados
-- com o fluxo de onboarding: envio do formulário de cadastro (Google Forms),
-- confirmação de dados (nome, CPF, RG frontal) e função definida pelo RH.
--
-- Colunas novas em rh_applications:
--   pre_hire_role     → função definida pelo RH (pode diferir da vaga que o
--                       candidato escolheu; alimenta a mensagem WhatsApp)
--   form_url_sent     → RH já mandou o link do formulário ao candidato
--   form_url_sent_at  → quando enviou
--   data_confirmed    → RH confirmou os dados cadastrais (modal de confirmação)

ALTER TABLE public.rh_applications
  ADD COLUMN IF NOT EXISTS pre_hire_role text,
  ADD COLUMN IF NOT EXISTS form_url_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_url_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_confirmed boolean NOT NULL DEFAULT false;

-- RH pode gravar o RG frontal do candidato no bucket rh-files (pasta onb/).
-- A policy existente (rh_files_public_insert) cobre apenas anon/cvs.
DROP POLICY IF EXISTS rh_files_admin_insert ON storage.objects;
CREATE POLICY rh_files_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rh-files' AND rh_is_admin());
