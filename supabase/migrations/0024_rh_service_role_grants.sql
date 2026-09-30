-- 0024: GRANT para service_role nas tabelas do PORTAL DO RH (rh_*)
--
-- O schema RH de referência (sistema "Contratação") concedeu privilégios
-- apenas para anon/authenticated/supabase_admin. A edge function flow-ops
-- usa o cliente admin com o papel `service_role`, que tem BYPASSRLS mas
-- NÃO tem os GRANTs de tabela — sem eles, a op rhAnalyzeApplication falha
-- com "permission denied for table rh_applications" mesmo com RLS vencida
-- pelo papel. O bypass de RLS não dispensa GRANT.
--
-- Aplica GRANTs em todas as tabelas/sequências rh_* e fixa default
-- privileges para objetos futuros do schema public.

DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'rh_%'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', obj.tablename);
  END LOOP;

  FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename LIKE 'rh_%'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', obj.sequencename);
  END LOOP;
END
$$;

-- Objetos futuros (incl. rh_* criados depois) já nascem acessíveis à edge.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
