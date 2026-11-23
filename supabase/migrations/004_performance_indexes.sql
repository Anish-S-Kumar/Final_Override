-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 004: PERFORMANCE INDEXES
-- Optimized indices for high concurrency, fast lookups, and leaderboard sorting
-- ==============================================================================

-- 1. Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_members_team_id ON public.members("teamId");
CREATE INDEX IF NOT EXISTS idx_progress_team_id ON public.progress("teamId");
CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON public.submissions("teamId");
CREATE INDEX IF NOT EXISTS idx_hint_usage_team_id ON public.hint_usage("teamId");
CREATE INDEX IF NOT EXISTS idx_chat_team_id ON public.chat("teamId");
CREATE INDEX IF NOT EXISTS idx_violations_team_id ON public.violations("teamId");

-- 2. Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_teams_session_token ON public.teams("sessionToken");
CREATE INDEX IF NOT EXISTS idx_teams_name_lower ON public.teams(lower(name));
CREATE INDEX IF NOT EXISTS idx_members_device_token ON public.members("deviceToken");
CREATE INDEX IF NOT EXISTS idx_submissions_idempotency ON public.submissions("idempotencyKey");
CREATE INDEX IF NOT EXISTS idx_hint_usage_idempotency ON public.hint_usage("idempotencyKey");
CREATE INDEX IF NOT EXISTS idx_leader_recovery_code ON public.leader_recovery(code);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions("tokenHash");
CREATE INDEX IF NOT EXISTS idx_hint_config_stage_order ON public.hint_config(stage, "displayOrder");

-- 3. Leaderboard and Progress Sorting Indexes
CREATE INDEX IF NOT EXISTS idx_teams_leaderboard ON public.teams(
  stage DESC,
  "finishedAt" ASC NULLS LAST,
  "penaltyMin" ASC,
  "startedAt" ASC
);

CREATE INDEX IF NOT EXISTS idx_teams_status ON public.teams(status);
CREATE INDEX IF NOT EXISTS idx_submissions_stage_ok ON public.submissions("teamId", stage, ok);
CREATE INDEX IF NOT EXISTS idx_chat_recent ON public.chat("teamId", at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_recent ON public.violations("teamId", at DESC);

-- 4. Record Schema Migration
INSERT INTO public.schema_version (version, applied_at)
VALUES (4, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();
