-- Custom SQL migration file, put your code below! --

-- Le rôle vit dans le CLUSTER, pas dans la base : sur un cluster déjà pourvu, un
-- CREATE USER sec ferait échouer toute la migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'query_builder') THEN
    CREATE USER query_builder WITH LOGIN;
  END IF;
END $$;
--> statement-breakpoint

-- Nom de base résolu à l'exécution : il était codé en dur, ce qui imposait d'appeler la
-- base « slowpoke » et faisait échouer toute installation nommée autrement.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO query_builder', current_database());
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO query_builder;

GRANT SELECT ON public.data_breach_incident TO query_builder;
GRANT SELECT ON public.ddos_incident TO query_builder;
GRANT SELECT ON public.incident TO query_builder;
GRANT SELECT ON public.incident_artifact TO query_builder;
GRANT SELECT ON public.incident_extension TO query_builder;
GRANT SELECT ON public.incident_log TO query_builder;
GRANT SELECT ON public.incident_user TO query_builder;
GRANT SELECT ON public.intrusion_incident TO query_builder;
GRANT SELECT ON public.malware_incident TO query_builder;
GRANT SELECT ON public.phishing_connection_action TO query_builder;
GRANT SELECT ON public.phishing_connection_log TO query_builder;
GRANT SELECT ON public.phishing_detail TO query_builder;
GRANT SELECT ON public.phishing_identity TO query_builder;
GRANT SELECT ON public.ransomware_incident TO query_builder;