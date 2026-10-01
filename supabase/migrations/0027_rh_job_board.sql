-- 0027: JOB BOARD (vagas.flwdesk.com) — busca pública de vagas dos clientes
-- credenciados do FLOW.
--
-- VAGAS só entram no board se:
--   status = 'open' E public_board = true (opt-in do cliente credenciado)
--   AND a empresa (cliente) estiver credenciada em flow_company_board.
--
-- 1) rh_jobs.company_name: nome comercial do cliente (exibe no board).
-- 2) flow_company_board: credenciamento (uma linha por cliente/tenant).
-- 3) rh_public_job_board(): busca pública (anon) por cargo + local.

ALTER TABLE public.rh_jobs
  ADD COLUMN IF NOT EXISTS company_name text;

-- ---------- Credenciamento de clientes ----------
CREATE TABLE IF NOT EXISTS public.flow_company_board (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  tenant_key text NOT NULL DEFAULT 'flowone',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_company_board_tenant_key
  ON public.flow_company_board (lower(tenant_key));

ALTER TABLE public.flow_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_company_board ENABLE ROW LEVEL SECURITY;

-- Leitura pública só da linha ativa (o board consulta via RPC security definer
-- mesmo, a policy é defesa extra).
DROP POLICY IF EXISTS flow_company_board_read ON public.flow_company_board;
CREATE POLICY flow_company_board_read
  ON public.flow_company_board FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- Escrita: RH admin (gestão de credenciamento via app).
DROP POLICY IF EXISTS flow_company_board_admin_all ON public.flow_company_board;
CREATE POLICY flow_company_board_admin_all
  ON public.flow_company_board FOR ALL
  TO authenticated
  USING (public.rh_is_admin())
  WITH CHECK (public.rh_is_admin());

GRANT SELECT ON TABLE public.flow_company_board TO anon, authenticated;
GRANT ALL ON TABLE public.flow_company_board TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.flow_company_board TO service_role;

-- ---------- Busca pública do board ----------
CREATE OR REPLACE FUNCTION public.rh_public_job_board(
  p_query text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  company_name text,
  location text,
  work_model text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_visible boolean,
  openings int,
  description text,
  requirements jsonb,
  benefits jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id, j.slug, j.title,
         coalesce(j.company_name, cb.company_name) AS company_name,
         j.location, j.work_model, j.employment_type::text,
         j.salary_min, j.salary_max, j.salary_visible,
         j.openings, j.description, j.requirements, j.benefits,
         j.created_at
    FROM public.rh_jobs j
    LEFT JOIN LATERAL (
      SELECT company_name FROM public.flow_company_board
       WHERE active = true ORDER BY created_at LIMIT 1
    ) cb ON true
   WHERE j.status = 'open'
     AND j.public_board = true
     AND EXISTS (SELECT 1 FROM public.flow_company_board fcb WHERE fcb.active = true)
     AND (p_query IS NULL OR p_query = ''
          OR j.title ILIKE '%' || p_query || '%'
          OR j.description ILIKE '%' || p_query || '%'
          OR j.department ILIKE '%' || p_query || '%'
          OR j.requirements::text ILIKE '%' || p_query || '%')
     AND (p_location IS NULL OR p_location = ''
          OR j.location ILIKE '%' || p_location || '%')
   ORDER BY j.created_at DESC
   LIMIT least(p_limit, 50)
  OFFSET greatest(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.rh_public_job_board(text, text, int, int) TO anon, authenticated;

-- ---------- Public_board default false (opt-in) ----------
ALTER TABLE public.rh_jobs
  ADD COLUMN IF NOT EXISTS public_board boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
