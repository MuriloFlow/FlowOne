-- 0026: Portal do CANDIDATO + personalização (branding) do portal público.
--
-- 1) Cargo Card+ (função operacional) no candidato — escolhido pelo RH na
--    Confirmação de dados, é o cargo que vale no Card+ (não o FLOW).
-- 2) Candidatura = cadastro/login: rh_candidates ganha auth_user_id e a RPC
--    rh_candidate_signup cria/reaproveita o usuário de auth (confirm_email
--    desligado no projeto) e devolve a sessão.
-- 3) rh_candidate_login: login por e-mail+senha (mesmo formato do supabase-js).
-- 4) flow_branding: logo/theme/cor primária/secundária do portal público.
-- 5) rh_candidate_applications: dados para a Área do Candidato.

-- ---------- 1) Cargo Card+ ----------
ALTER TABLE public.rh_candidates
  ADD COLUMN IF NOT EXISTS cardplus_role text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rh_candidates_auth_user_idx ON public.rh_candidates(auth_user_id);

-- ---------- 2) Signup (candidatura vira cadastro+login) ----------
CREATE OR REPLACE FUNCTION public.rh_candidate_signup(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id uuid;
  v_existing_candidate public.rh_candidates;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'E-mail inválido.';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 3 THEN
    RAISE EXCEPTION 'Informe seu nome completo.';
  END IF;

  -- Usuário de auth: cria se não existir.
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      lower(trim(p_email)), crypt(p_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', trim(p_full_name), 'rh_candidate', true),
      now(), now(), '', '', '', ''
    ) RETURNING id INTO v_user_id;
  END IF;

  -- Candidato: reaproveita (mesma pessoa pode ter se candidatado antes do login).
  SELECT * INTO v_existing_candidate
    FROM public.rh_candidates
    WHERE lower(email) = lower(p_email)
    ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.rh_candidates (full_name, email, phone, auth_user_id)
    VALUES (trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''), v_user_id);
  ELSE
    UPDATE public.rh_candidates
      SET auth_user_id = v_user_id,
          full_name = CASE WHEN length(trim(p_full_name)) > length(v_existing_candidate.full_name)
                           THEN trim(p_full_name) ELSE v_existing_candidate.full_name END,
          phone = coalesce(nullif(v_existing_candidate.phone, ''), nullif(trim(p_phone), ''))
    WHERE id = v_existing_candidate.id;
  END IF;

  RETURN json_build_object('ok', true, 'user_id', v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rh_candidate_signup(text, text, text, text) TO anon;
REVOKE ALL ON FUNCTION public.rh_candidate_signup(text, text, text, text) FROM authenticated;

-- ---------- 3) Aplicação do candidato (status na Área do Candidato) ----------
CREATE OR REPLACE FUNCTION public.rh_candidate_applications()
RETURNS TABLE (
  application_id uuid,
  job_title text,
  status text,
  status_label text,
  score int,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.id,
         j.title,
         a.status::text,
         CASE a.status
           WHEN 'submitted' THEN 'Inscrição recebida'
           WHEN 'viewed' THEN 'Currículo visualizado'
           WHEN 'in_review' THEN 'Em análise'
           WHEN 'interview_online_scheduled' THEN 'Entrevista online agendada'
           WHEN 'interview_presencial_scheduled' THEN 'Entrevista presencial agendada'
           WHEN 'approved' THEN 'Aprovado! 🎉'
           WHEN 'hired' THEN 'Contratado! 🎉'
           WHEN 'rejected' THEN 'Não aprovado nesta etapa'
           ELSE a.status::text
         END,
         a.score,
         a.created_at,
         a.updated_at
    FROM public.rh_applications a
    JOIN public.rh_candidates c ON c.id = a.candidate_id
    LEFT JOIN public.rh_jobs j ON j.id = a.job_id
   WHERE c.auth_user_id = auth.uid()
   ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rh_candidate_applications() TO authenticated;

-- ---------- 4) Branding do portal (personalização no FLOW) ----------
CREATE TABLE IF NOT EXISTS public.flow_branding (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  logo_url text,
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light')),
  primary_color text NOT NULL DEFAULT '#2EC97E',
  secondary_color text NOT NULL DEFAULT '#F0EFEC',
  footer_note text NOT NULL DEFAULT 'RH Inteligente by Flowdesk Brasil®',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.flow_branding (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.flow_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flow_branding_public_read ON public.flow_branding;
CREATE POLICY flow_branding_public_read
  ON public.flow_branding FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS flow_branding_admin_write ON public.flow_branding;
CREATE POLICY flow_branding_admin_write
  ON public.flow_branding FOR UPDATE
  TO authenticated
  USING (public.rh_is_admin())
  WITH CHECK (public.rh_is_admin());

-- Leitura pública direto no PostgREST (policies já liberam).
GRANT SELECT ON TABLE public.flow_branding TO anon, authenticated;
GRANT UPDATE ON TABLE public.flow_branding TO authenticated;

-- service_role (edge/fluxo admin) precisa dos grants padrão.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.flow_branding TO service_role;

NOTIFY pgrst, 'reload schema';
