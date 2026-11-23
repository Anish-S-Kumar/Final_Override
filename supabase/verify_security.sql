-- ==============================================================================
-- FINAL OVERRIDE — SECURITY & INTEGRITY VERIFICATION SCRIPT
-- Execute in Supabase SQL Editor to audit RLS, grants, and search_path settings
-- ==============================================================================

-- 1. Check Row Level Security (RLS) on all public tables
-- Expectation: all tables have rowsecurity = true and forcerowsecurity = true
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  CASE
    WHEN c.relrowsecurity AND c.relforcerowsecurity THEN 'PASS'
    ELSE 'FAIL: RLS NOT FORCED'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. Check Functions: SECURITY DEFINER & empty search_path
-- Expectation: all game functions have prosecdef = true and proconfig contains 'search_path='
SELECT
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config_settings,
  CASE
    WHEN p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%' THEN 'PASS'
    ELSE 'FAIL: INSECURE FUNCTION SETTINGS'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ping', 'register_team', 'join_member', 'get_team_state', 'submit_answer',
    'request_hint', 'advance_stage', 'add_violation', 'set_team_notes',
    'pause_team', 'resume_team', 'set_global_pause', 'adjust_penalty',
    'reset_stage', 'reissue_leader_session', 'redeem_leader_code',
    'launch_game', 'get_leaderboard', 'admin_overview', 'get_hint_configs',
    'update_hint_config', 'export_results'
  )
ORDER BY p.proname;

-- 3. Check for leaks to public / anon / authenticated
-- Expectation: 0 rows returned
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');

-- 4. Check schema version
SELECT version, applied_at FROM public.schema_version ORDER BY version ASC;
