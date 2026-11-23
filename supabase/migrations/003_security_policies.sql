-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 003: SECURITY POLICIES & ROW LEVEL SECURITY (RLS)
-- Defense-in-depth: Deny all direct client access; restrict to service_role
-- ==============================================================================

-- 1. Enable and Force RLS on all 16 tables
ALTER TABLE public.schema_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_version FORCE ROW LEVEL SECURITY;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams FORCE ROW LEVEL SECURITY;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.game_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_stages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sequences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress FORCE ROW LEVEL SECURITY;

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.hint_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hint_config FORCE ROW LEVEL SECURITY;

ALTER TABLE public.hint_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hint_usage FORCE ROW LEVEL SECURITY;

ALTER TABLE public.chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat FORCE ROW LEVEL SECURITY;

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.leader_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_recovery FORCE ROW LEVEL SECURITY;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_notes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

-- 2. Explicit Deny Policies for anon and authenticated roles
DROP POLICY IF EXISTS no_anon_access ON public.schema_version;
CREATE POLICY no_anon_access ON public.schema_version FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.settings;
CREATE POLICY no_anon_access ON public.settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.teams;
CREATE POLICY no_anon_access ON public.teams FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.members;
CREATE POLICY no_anon_access ON public.members FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.game_stages;
CREATE POLICY no_anon_access ON public.game_stages FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.team_sequences;
CREATE POLICY no_anon_access ON public.team_sequences FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.progress;
CREATE POLICY no_anon_access ON public.progress FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.submissions;
CREATE POLICY no_anon_access ON public.submissions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.hint_config;
CREATE POLICY no_anon_access ON public.hint_config FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.hint_usage;
CREATE POLICY no_anon_access ON public.hint_usage FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.chat;
CREATE POLICY no_anon_access ON public.chat FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.violations;
CREATE POLICY no_anon_access ON public.violations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.leader_recovery;
CREATE POLICY no_anon_access ON public.leader_recovery FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.admin_sessions;
CREATE POLICY no_anon_access ON public.admin_sessions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.team_notes;
CREATE POLICY no_anon_access ON public.team_notes FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS no_anon_access ON public.audit_log;
CREATE POLICY no_anon_access ON public.audit_log FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 3. Schema Grants
REVOKE ALL ON SCHEMA public FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 4. Record Schema Migration
INSERT INTO public.schema_version (version, applied_at)
VALUES (3, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();
