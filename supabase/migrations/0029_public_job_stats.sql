-- 0029: Estatísticas públicas do Recruta+ (job board).
-- Contagem de inscritos por vaga aberta — SOMENTE números agregados,
-- nenhum dado pessoal do candidato é exposto.

CREATE OR REPLACE FUNCTION public.rh_public_job_stats()
RETURNS TABLE (
  slug text,
  applicants int,
  openings int,
  hired int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.slug,
         count(a.id)::int AS applicants,
         greatest(j.openings, 0)::int AS openings,
         count(a.id) FILTER (WHERE a.status = 'hired')::int AS hired
    FROM public.rh_jobs j
    LEFT JOIN public.rh_applications a ON a.job_id = j.id
   WHERE j.status = 'open'
     AND j.public_board = true
   GROUP BY j.id, j.slug, j.openings
   ORDER BY j.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.rh_public_job_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.rh_public_job_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
