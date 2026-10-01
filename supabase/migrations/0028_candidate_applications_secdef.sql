-- 0028: fix "permission denied for schema auth" na Área do Candidato.
-- A RPC era SECURITY INVOKER e chama auth.uid() (schema auth), mas o papel
-- authenticated não tem USAGE no schema auth. SECURITY DEFINER (owner
-- supabase_admin) resolve, com search_path fixado em public para segurança.
CREATE OR REPLACE FUNCTION public.rh_candidate_applications()
RETURNS TABLE(
  application_id uuid,
  job_title text,
  status text,
  status_label text,
  score integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
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

REVOKE ALL ON FUNCTION public.rh_candidate_applications() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_candidate_applications() TO authenticated;

-- Tema claro é o padrão do portal público.
UPDATE public.flow_branding SET theme = 'light' WHERE theme = 'dark';
