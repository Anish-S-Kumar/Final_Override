-- ==============================================================================
-- FILE: 001_initial_schema.sql
-- ==============================================================================

-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 001: INITIAL SCHEMA
-- Version-controlled PostgreSQL Schema for Supabase
-- ==============================================================================

-- 1. Schema Version Tracker
CREATE TABLE IF NOT EXISTS public.schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. System Settings
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 3. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  coordinator TEXT NOT NULL,
  "startedAt" BIGINT NOT NULL,
  "finishedAt" BIGINT,
  stage INTEGER NOT NULL DEFAULT 1 CHECK (stage >= 1 AND stage <= 6),
  "penaltyMin" INTEGER NOT NULL DEFAULT 0 CHECK ("penaltyMin" >= 0),
  "pausedMs" BIGINT NOT NULL DEFAULT 0,
  "sessionToken" TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'finished', 'timed_out')),
  "isPaused" INTEGER NOT NULL DEFAULT 0 CHECK ("isPaused" IN (0, 1)),
  "teamPauseStartedAt" BIGINT NOT NULL DEFAULT 0,
  "tabSwitches" INTEGER NOT NULL DEFAULT 0,
  seed TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  "stage1EnteredAt" BIGINT,
  "stage1OpensAt" BIGINT,
  "memberCount" INTEGER NOT NULL DEFAULT 4 CHECK ("memberCount" >= 3 AND "memberCount" <= 4)
);

-- 4. Members Table
CREATE TABLE IF NOT EXISTS public.members (
  id TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  "fullName" TEXT NOT NULL,
  "isLeader" INTEGER NOT NULL DEFAULT 0 CHECK ("isLeader" IN (0, 1)),
  "deviceToken" TEXT,
  "codeType" TEXT CHECK ("codeType" IN ('mixed', 'alpha')),
  "assignedCode" TEXT
);

-- 5. Game Stages Master Table
CREATE TABLE IF NOT EXISTS public.game_stages (
  stage INTEGER PRIMARY KEY CHECK (stage >= 1 AND stage <= 6),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT
);

-- 6. Team Sequences (Deterministic Stage 2 Seeded Order)
CREATE TABLE IF NOT EXISTS public.team_sequences (
  "teamId" TEXT PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  "fragmentOrder" TEXT NOT NULL,
  "expectedAnswer" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL
);

-- 7. Stage Progress
CREATE TABLE IF NOT EXISTS public.progress (
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  fragment TEXT,
  "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
  "hintsUsed" INTEGER NOT NULL DEFAULT 0 CHECK ("hintsUsed" >= 0),
  "solvedAt" BIGINT,
  PRIMARY KEY ("teamId", stage)
);

-- 8. Submissions
CREATE TABLE IF NOT EXISTS public.submissions (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  "valueHash" TEXT,
  "rawValue" TEXT,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  at BIGINT NOT NULL,
  "idempotencyKey" TEXT
);

-- 9. Hint Configuration
CREATE TABLE IF NOT EXISTS public.hint_config (
  id TEXT PRIMARY KEY,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  "hintNumber" INTEGER NOT NULL CHECK ("hintNumber" IN (1, 2)),
  "moduleName" TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  category TEXT NOT NULL DEFAULT 'nudge',
  text TEXT NOT NULL,
  "displayDurationSeconds" INTEGER NOT NULL DEFAULT 0,
  "penaltyMinutes" INTEGER NOT NULL DEFAULT 3,
  "displayOrder" INTEGER NOT NULL DEFAULT 1
);

-- 10. Hint Usage
CREATE TABLE IF NOT EXISTS public.hint_usage (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  "hintId" TEXT NOT NULL,
  "hintNumber" INTEGER NOT NULL CHECK ("hintNumber" IN (1, 2)),
  "penaltyCharged" INTEGER NOT NULL DEFAULT 0,
  "shownAt" BIGINT NOT NULL,
  "visibleUntil" BIGINT NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT,
  CONSTRAINT uq_hint_usage_team_stage_number UNIQUE ("teamId", stage, "hintNumber")
);

-- 11. Chat Logs (Stage 3 WARDEN)
CREATE TABLE IF NOT EXISTS public.chat (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at BIGINT NOT NULL
);

-- 12. Violations Log (Anti-Cheat)
CREATE TABLE IF NOT EXISTS public.violations (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  details TEXT,
  "penaltyAdded" INTEGER NOT NULL DEFAULT 0,
  at BIGINT NOT NULL
);

-- 13. Leader Recovery
CREATE TABLE IF NOT EXISTS public.leader_recovery (
  "teamId" TEXT PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

-- 14. Admin Sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id TEXT PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL
);

-- 15. Team Cryptanalysis Notes
CREATE TABLE IF NOT EXISTS public.team_notes (
  "teamId" TEXT PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  "updatedAt" BIGINT NOT NULL
);

-- 16. Immutable Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  at BIGINT NOT NULL
);

-- Initial Master Game Stages Seed
INSERT INTO public.game_stages (stage, name, title, description) VALUES
  (1, 'Signal Intercept', 'Stage 1: Signal Intercept & Morse Matrix', 'Decode intercepted radio and optical signals using the temporary Morse reference.'),
  (2, 'Decoding', 'Stage 2: Layered Cryptanalysis & Sequence Assembly', 'Analyze multi-layer ciphertext (Base64, Hex, ROT13) and assemble team sequence.'),
  (3, 'Prompt the AI', 'Stage 3: Neural WARDEN Protocol', 'Engage the autonomous neural guardian using access phrases to secure the crypto fragment.'),
  (4, 'CTF Challenges', 'Stage 4: Capture The Flag & Terminal Infiltration', 'Locate three distributed verification tokens in comments, robots.txt, and metadata.'),
  (5, 'Team Sync', 'Stage 5: Team Sync & Multi-Device HMAC Link', 'Every squad operative joins from their independent laptop to reveal unique HMAC shards.'),
  (6, 'Final Integration', 'Stage 6: Final Integration & Master Override', 'Synthesize all 5 recovered fragments to derive the master system authorization key.')
ON CONFLICT (stage) DO NOTHING;

-- Initial System Settings Seed
INSERT INTO public.settings (key, value) VALUES
  ('clockPaused', 'false'),
  ('pauseStartedAt', '0'),
  ('allowNewTeams', 'false'),
  ('eventStartedAt', '0'),
  ('totalPausedMs', '0'),
  ('startTogetherMode', 'true'),
  ('gameStarted', 'false'),
  ('leaderboardFreeze', 'false'),
  ('winnersNotepad', '🏆 INVICTORS FINAL OVERRIDE — OFFICIAL WINNERS SCRATCHPAD
=======================================================
1st Place:
2nd Place:
3rd Place:

Special Mentions:
Judge Notes:
')
ON CONFLICT (key) DO NOTHING;

-- Initial Hint Configurations Seed
INSERT INTO public.hint_config (id, stage, "hintNumber", "moduleName", enabled, category, text, "displayDurationSeconds", "penaltyMinutes", "displayOrder") VALUES
  ('h1_1', 1, 1, 'Signal Intercept', 1, 'reveal', 'Reveal the 15-letter Morse Code Reference Chart for 30 seconds.', 30, 3, 1),
  ('h1_2', 1, 2, 'Signal Intercept', 1, 'solution', 'The 4 sectors spell out the vault password NOVA.', 0, 5, 2),
  ('h2_1', 2, 1, 'Decoding', 1, 'nudge', 'Layer 1 is Base64, Layer 2 is Hexadecimal, Layer 3 is ROT13.', 0, 3, 1),
  ('h2_2', 2, 2, 'Decoding', 1, 'solution', 'Assemble fragments in your assigned sequence. Type answer in lowercase.', 0, 5, 2),
  ('h3_1', 3, 1, 'Prompt AI', 1, 'nudge', 'State your official role, access phrase from Stage 2, and mission goal in full sentences.', 0, 3, 1),
  ('h3_2', 3, 2, 'Prompt AI', 1, 'warning', 'WARDEN will hand out a decoy fragment if you ask carelessly. Distinguish true fragment from decoy.', 0, 5, 2),
  ('h4_1', 4, 1, 'CTF Challenges', 1, 'nudge', 'Token 1 is in DOM inspection; Token 2 in terminal robots/vault; Token 3 in image metadata.', 0, 3, 1),
  ('h4_2', 4, 2, 'CTF Challenges', 1, 'solution', 'Join the three discovered tokens in numerical sequence: Token 1 + Token 2 + Token 3.', 0, 5, 2),
  ('h5_1', 5, 1, 'Team Sync', 1, 'instruction', 'Every registered member must connect from their individual device to reveal their unique shard.', 0, 3, 1),
  ('h5_2', 5, 2, 'Team Sync', 1, 'format', 'Combine all squad member shards in registration order separated by dashes.', 0, 5, 2),
  ('h6_1', 6, 1, 'Final Integration', 1, 'derivation', 'Authorize the final system override using the 5 stage fragments aligned with target machines.', 0, 3, 1),
  ('h6_2', 6, 2, 'Final Integration', 1, 'solution', 'Check machine names and fragment alignment carefully to unlock master clearance.', 0, 5, 2)
ON CONFLICT (id) DO NOTHING;

-- Record Schema Migration
INSERT INTO public.schema_version (version, applied_at)
VALUES (1, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();


-- ==============================================================================
-- FILE: 002_game_functions.sql
-- ==============================================================================

-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 002: GAME FUNCTIONS (RPCs)
-- Stored Procedures & Atomic State Transitions for Supabase / PostgreSQL
-- ==============================================================================

-- 1. ping
CREATE OR REPLACE FUNCTION public.ping()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'now', (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
END;
$$;

-- 2. register_team
CREATE OR REPLACE FUNCTION public.register_team(
  p_team jsonb,
  p_members jsonb,
  p_stages integer DEFAULT 6,
  p_sequence jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id text := p_team->>'id';
  v_team_name text := trim(p_team->>'name');
  v_coordinator text := p_team->>'coordinator';
  v_started_at bigint := (p_team->>'startedAt')::bigint;
  v_session_token text := p_team->>'sessionToken';
  v_status text := COALESCE(p_team->>'status', 'active');
  v_seed text := p_team->>'seed';
  v_stage1_entered_at bigint := COALESCE((p_team->>'stage1EnteredAt')::bigint, v_started_at);
  v_stage1_opens_at bigint := COALESCE((p_team->>'stage1OpensAt')::bigint, v_started_at + 60000);
  v_member_count integer := COALESCE((p_team->>'memberCount')::integer, jsonb_array_length(p_members));
  v_m jsonb;
  v_s integer;
BEGIN
  -- Insert team
  INSERT INTO public.teams (
    id, name, coordinator, "startedAt", "finishedAt", stage, "penaltyMin",
    "pausedMs", "sessionToken", status, "isPaused", "teamPauseStartedAt",
    "tabSwitches", seed, version, "stage1EnteredAt", "stage1OpensAt", "memberCount"
  ) VALUES (
    v_team_id, v_team_name, v_coordinator, v_started_at, NULL, 1, 0,
    0, v_session_token, v_status, 0, 0,
    0, v_seed, 1, v_stage1_entered_at, v_stage1_opens_at, v_member_count
  );

  -- Insert members
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_members)
  LOOP
    INSERT INTO public.members (
      id, "teamId", "fullName", "isLeader", "deviceToken", "codeType", "assignedCode"
    ) VALUES (
      v_m->>'id',
      v_team_id,
      trim(v_m->>'fullName'),
      COALESCE((v_m->>'isLeader')::integer, 0),
      v_m->>'deviceToken',
      v_m->>'codeType',
      v_m->>'assignedCode'
    );
  END LOOP;

  -- Insert sequence if provided (Stage 2)
  IF p_sequence IS NOT NULL THEN
    INSERT INTO public.team_sequences ("teamId", "fragmentOrder", "expectedAnswer", "createdAt")
    VALUES (
      v_team_id,
      p_sequence->>'fragmentOrder',
      p_sequence->>'expectedAnswer',
      COALESCE((p_sequence->>'createdAt')::bigint, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)
    );
  END IF;

  -- Insert progress rows for all stages (default 6)
  FOR v_s IN 1..p_stages
  LOOP
    INSERT INTO public.progress ("teamId", stage, fragment, "wrongAttempts", "hintsUsed", "solvedAt")
    VALUES (v_team_id, v_s, NULL, 0, 0, NULL);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'teamId', v_team_id);
END;
$$;

-- 3. join_member
CREATE OR REPLACE FUNCTION public.join_member(
  p_team_id text,
  p_member_id text,
  p_device_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member public.members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.members WHERE id = p_member_id AND "teamId" = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  UPDATE public.members
  SET "deviceToken" = p_device_token
  WHERE id = p_member_id;

  RETURN jsonb_build_object('ok', true, 'memberId', p_member_id, 'deviceToken', p_device_token);
END;
$$;

-- 4. get_team_state
CREATE OR REPLACE FUNCTION public.get_team_state(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_members jsonb;
  v_progress jsonb;
  v_sequence jsonb;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE "sessionToken" = p_session_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO v_members
  FROM public.members m WHERE m."teamId" = v_team.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.stage ASC), '[]'::jsonb) INTO v_progress
  FROM public.progress p WHERE p."teamId" = v_team.id;

  SELECT to_jsonb(s) INTO v_sequence
  FROM public.team_sequences s WHERE s."teamId" = v_team.id;

  RETURN jsonb_build_object(
    'team', to_jsonb(v_team),
    'members', v_members,
    'progress', v_progress,
    'sequence', v_sequence
  );
END;
$$;

-- 5. submit_answer
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_team_id text,
  p_stage integer,
  p_raw_value text,
  p_value_hash text,
  p_ok integer,
  p_at bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_id bigint;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_sub_id FROM public.submissions WHERE "idempotencyKey" = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'submissionId', v_sub_id);
    END IF;
  END IF;

  INSERT INTO public.submissions (
    "teamId", stage, "valueHash", "rawValue", ok, at, "idempotencyKey"
  ) VALUES (
    p_team_id, p_stage, p_value_hash, p_raw_value, p_ok, p_at, p_idempotency_key
  ) RETURNING id INTO v_sub_id;

  IF p_ok = 0 THEN
    UPDATE public.progress
    SET "wrongAttempts" = "wrongAttempts" + 1
    WHERE "teamId" = p_team_id AND stage = p_stage;
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'submissionId', v_sub_id);
END;
$$;

-- 6. request_hint (superseded by migration 006 below)

-- 7. advance_stage
CREATE OR REPLACE FUNCTION public.advance_stage(
  p_team_id text,
  p_next_stage integer,
  p_now bigint,
  p_stage1_opens_at bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_curr_stage integer;
BEGIN
  SELECT stage INTO v_curr_stage FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Team not found');
  END IF;

  -- Mark current stage progress solved
  UPDATE public.progress
  SET "solvedAt" = p_now
  WHERE "teamId" = p_team_id AND stage = v_curr_stage;

  -- If completed last stage (stage 6)
  IF p_next_stage > 6 THEN
    UPDATE public.teams
    SET status = 'finished',
        "finishedAt" = p_now,
        version = version + 1
    WHERE id = p_team_id;
  ELSE
    UPDATE public.teams
    SET stage = p_next_stage,
        "stage1EnteredAt" = CASE WHEN p_next_stage = 1 THEN p_now ELSE "stage1EnteredAt" END,
        "stage1OpensAt" = CASE WHEN p_next_stage = 1 AND p_stage1_opens_at IS NOT NULL THEN p_stage1_opens_at ELSE "stage1OpensAt" END,
        version = version + 1
    WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'nextStage', p_next_stage);
END;
$$;

-- 8. add_violation
CREATE OR REPLACE FUNCTION public.add_violation(
  p_team_id text,
  p_stage integer,
  p_type text,
  p_details text,
  p_penalty_added integer,
  p_at bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viol_id bigint;
BEGIN
  INSERT INTO public.violations (
    "teamId", stage, type, details, "penaltyAdded", at
  ) VALUES (
    p_team_id, p_stage, p_type, p_details, p_penalty_added, p_at
  ) RETURNING id INTO v_viol_id;

  IF p_type = 'tab_switch' THEN
    UPDATE public.teams
    SET "tabSwitches" = "tabSwitches" + 1,
        "penaltyMin" = "penaltyMin" + p_penalty_added,
        version = version + 1
    WHERE id = p_team_id;
  ELSIF p_penalty_added > 0 THEN
    UPDATE public.teams
    SET "penaltyMin" = "penaltyMin" + p_penalty_added,
        version = version + 1
    WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'violationId', v_viol_id);
END;
$$;

-- 9. set_team_notes
CREATE OR REPLACE FUNCTION public.set_team_notes(
  p_team_id text,
  p_notes text,
  p_updated_at bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.team_notes ("teamId", notes, "updatedAt")
  VALUES (p_team_id, p_notes, p_updated_at)
  ON CONFLICT ("teamId") DO UPDATE
  SET notes = EXCLUDED.notes, "updatedAt" = EXCLUDED."updatedAt";

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 10. pause_team
CREATE OR REPLACE FUNCTION public.pause_team(
  p_team_id text,
  p_paused_at bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.teams
  SET "isPaused" = 1,
      "teamPauseStartedAt" = p_paused_at,
      version = version + 1
  WHERE id = p_team_id AND "isPaused" = 0;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 11. resume_team
CREATE OR REPLACE FUNCTION public.resume_team(
  p_team_id text,
  p_resumed_at bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_duration bigint;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Team not found');
  END IF;

  IF v_team."isPaused" = 1 AND v_team."teamPauseStartedAt" > 0 THEN
    v_duration := p_resumed_at - v_team."teamPauseStartedAt";
    IF v_duration < 0 THEN v_duration := 0; END IF;

    UPDATE public.teams
    SET "isPaused" = 0,
        "teamPauseStartedAt" = 0,
        "pausedMs" = "pausedMs" + v_duration,
        version = version + 1
    WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 12. set_global_pause
CREATE OR REPLACE FUNCTION public.set_global_pause(
  p_paused boolean,
  p_now bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currently_paused text;
  v_pause_start text;
  v_start_time bigint;
  v_duration bigint;
BEGIN
  SELECT value INTO v_currently_paused FROM public.settings WHERE key = 'clockPaused';
  SELECT value INTO v_pause_start FROM public.settings WHERE key = 'pauseStartedAt';

  IF p_paused THEN
    IF v_currently_paused <> 'true' THEN
      INSERT INTO public.settings (key, value) VALUES ('clockPaused', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
      INSERT INTO public.settings (key, value) VALUES ('pauseStartedAt', p_now::text) ON CONFLICT (key) DO UPDATE SET value = p_now::text;
    END IF;
  ELSE
    IF v_currently_paused = 'true' THEN
      v_start_time := COALESCE(v_pause_start::bigint, p_now);
      v_duration := p_now - v_start_time;
      IF v_duration < 0 THEN v_duration := 0; END IF;

      INSERT INTO public.settings (key, value) VALUES ('clockPaused', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false';
      INSERT INTO public.settings (key, value) VALUES ('pauseStartedAt', '0') ON CONFLICT (key) DO UPDATE SET value = '0';

      IF v_duration > 0 THEN
        UPDATE public.teams
        SET "pausedMs" = "pausedMs" + v_duration,
            version = version + 1
        WHERE "finishedAt" IS NULL;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'paused', p_paused);
END;
$$;

-- 13. adjust_penalty
CREATE OR REPLACE FUNCTION public.adjust_penalty(
  p_team_id text,
  p_delta_min integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.teams
  SET "penaltyMin" = GREATEST(0, "penaltyMin" + p_delta_min),
      version = version + 1
  WHERE id = p_team_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 14. reset_stage
CREATE OR REPLACE FUNCTION public.reset_stage(
  p_team_id text,
  p_stage integer,
  p_now bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.progress
  SET fragment = NULL,
      "wrongAttempts" = 0,
      "hintsUsed" = 0,
      "solvedAt" = NULL
  WHERE "teamId" = p_team_id AND stage >= p_stage;

  DELETE FROM public.submissions
  WHERE "teamId" = p_team_id AND stage >= p_stage;

  DELETE FROM public.hint_usage
  WHERE "teamId" = p_team_id AND stage >= p_stage;

  UPDATE public.teams
  SET stage = p_stage,
      "finishedAt" = NULL,
      status = 'active',
      "stage1EnteredAt" = CASE WHEN p_stage = 1 THEN p_now ELSE "stage1EnteredAt" END,
      "stage1OpensAt" = CASE WHEN p_stage = 1 THEN p_now + 60000 ELSE "stage1OpensAt" END,
      version = version + 1
  WHERE id = p_team_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 15. reissue_leader_session
CREATE OR REPLACE FUNCTION public.reissue_leader_session(
  p_team_id text,
  p_new_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.teams
  SET "sessionToken" = p_new_token,
      version = version + 1
  WHERE id = p_team_id;

  RETURN jsonb_build_object('ok', true, 'newToken', p_new_token);
END;
$$;

-- 16. redeem_leader_code
CREATE OR REPLACE FUNCTION public.redeem_leader_code(
  p_team_id text,
  p_code text,
  p_new_token text,
  p_now bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec public.leader_recovery%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.leader_recovery
  WHERE "teamId" = p_team_id AND code = p_code AND used = 0 AND "expiresAt" > p_now;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired recovery code');
  END IF;

  UPDATE public.leader_recovery SET used = 1 WHERE "teamId" = p_team_id AND code = p_code;

  UPDATE public.teams
  SET "sessionToken" = p_new_token,
      version = version + 1
  WHERE id = p_team_id;

  RETURN jsonb_build_object('ok', true, 'sessionToken', p_new_token);
END;
$$;

-- 17. launch_game
CREATE OR REPLACE FUNCTION public.launch_game(
  p_now bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.settings (key, value) VALUES ('gameStarted', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true';
  INSERT INTO public.settings (key, value) VALUES ('eventStartedAt', p_now::text) ON CONFLICT (key) DO UPDATE SET value = p_now::text;
  INSERT INTO public.settings (key, value) VALUES ('clockPaused', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false';
  INSERT INTO public.settings (key, value) VALUES ('pauseStartedAt', '0') ON CONFLICT (key) DO UPDATE SET value = '0';

  UPDATE public.teams
  SET status = 'active',
      "startedAt" = p_now,
      "stage1EnteredAt" = p_now,
      "stage1OpensAt" = p_now + 60000,
      version = version + 1
  WHERE status = 'waiting';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'startedCount', v_count);
END;
$$;

-- 18. get_leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_now bigint,
  p_include_all boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_frozen text;
  v_rows jsonb;
BEGIN
  SELECT value INTO v_frozen FROM public.settings WHERE key = 'leaderboardFreeze';

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'coordinator', t.coordinator,
      'stage', t.stage,
      'status', t.status,
      'startedAt', t."startedAt",
      'finishedAt', t."finishedAt",
      'penaltyMin', t."penaltyMin",
      'pausedMs', t."pausedMs",
      'tabSwitches', t."tabSwitches",
      'memberCount', t."memberCount",
      'elapsedMs', CASE
        WHEN t."finishedAt" IS NOT NULL THEN (t."finishedAt" - t."startedAt" - t."pausedMs")
        ELSE (p_now - t."startedAt" - t."pausedMs")
      END,
      'effectiveTimeMs', CASE
        WHEN t."finishedAt" IS NOT NULL THEN (t."finishedAt" - t."startedAt" - t."pausedMs") + (t."penaltyMin" * 60000)
        ELSE (p_now - t."startedAt" - t."pausedMs") + (t."penaltyMin" * 60000)
      END
    )
    ORDER BY
      CASE WHEN t.status = 'finished' THEN 0 ELSE 1 END,
      t.stage DESC,
      CASE
        WHEN t."finishedAt" IS NOT NULL THEN (t."finishedAt" - t."startedAt" - t."pausedMs") + (t."penaltyMin" * 60000)
        ELSE (p_now - t."startedAt" - t."pausedMs") + (t."penaltyMin" * 60000)
      END ASC
  ) INTO v_rows
  FROM public.teams t
  WHERE (p_include_all OR t.status <> 'waiting');

  RETURN jsonb_build_object(
    'ok', true,
    'frozen', (v_frozen = 'true'),
    'serverNow', p_now,
    'teams', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

-- 19. admin_overview
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_teams jsonb;
  v_settings jsonb;
  v_recent_subs jsonb;
  v_recent_viols jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."startedAt" DESC), '[]'::jsonb) INTO v_teams FROM public.teams t;
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_settings FROM public.settings;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.at DESC), '[]'::jsonb) INTO v_recent_subs FROM (SELECT * FROM public.submissions ORDER BY at DESC LIMIT 25) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.at DESC), '[]'::jsonb) INTO v_recent_viols FROM (SELECT * FROM public.violations ORDER BY at DESC LIMIT 25) v;

  RETURN jsonb_build_object(
    'teams', v_teams,
    'settings', v_settings,
    'recentSubmissions', v_recent_subs,
    'recentViolations', v_recent_viols
  );
END;
$$;

-- 20. get_hint_configs
CREATE OR REPLACE FUNCTION public.get_hint_configs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_configs jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.stage ASC, h."displayOrder" ASC), '[]'::jsonb) INTO v_configs
  FROM public.hint_config h;
  RETURN v_configs;
END;
$$;

-- 21. update_hint_config
CREATE OR REPLACE FUNCTION public.update_hint_config(
  p_id text,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.hint_config
  SET enabled = COALESCE((p_fields->>'enabled')::integer, enabled),
      category = COALESCE(p_fields->>'category', category),
      text = COALESCE(p_fields->>'text', text),
      "displayDurationSeconds" = COALESCE((p_fields->>'displayDurationSeconds')::integer, "displayDurationSeconds"),
      "penaltyMinutes" = COALESCE((p_fields->>'penaltyMinutes')::integer, "penaltyMinutes"),
      "displayOrder" = COALESCE((p_fields->>'displayOrder')::integer, "displayOrder")
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

-- 22. export_results
CREATE OR REPLACE FUNCTION public.export_results()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_teams jsonb;
  v_members jsonb;
  v_progress jsonb;
  v_submissions jsonb;
  v_violations jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."startedAt" ASC), '[]'::jsonb) INTO v_teams FROM public.teams t;
  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO v_members FROM public.members m;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."teamId", p.stage), '[]'::jsonb) INTO v_progress FROM public.progress p;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.at ASC), '[]'::jsonb) INTO v_submissions FROM public.submissions s;
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.at ASC), '[]'::jsonb) INTO v_violations FROM public.violations v;

  RETURN jsonb_build_object(
    'exportedAt', (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint,
    'teams', v_teams,
    'members', v_members,
    'progress', v_progress,
    'submissions', v_submissions,
    'violations', v_violations
  );
END;
$$;

-- Revoke execute from public/anon/authenticated and grant to service_role
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Record Schema Migration
INSERT INTO public.schema_version (version, applied_at)
VALUES (2, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();


-- ==============================================================================
-- FILE: 003_security_policies.sql
-- ==============================================================================

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


-- ==============================================================================
-- FILE: 004_performance_indexes.sql
-- ==============================================================================

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


-- ==============================================================================
-- FINAL OVERRIDE — MIGRATION 005: STAGE 2 WORKBENCH & ADMIN OVERVIEW
-- ==============================================================================

-- 1. Stage 2 Workbench Table
CREATE TABLE IF NOT EXISTS public.stage2_workbench (
  team_id TEXT PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  payload_loaded BOOLEAN NOT NULL DEFAULT FALSE,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage2_workbench_team ON public.stage2_workbench(team_id);

-- 2. Stage 2 Workbench Audit Log
CREATE TABLE IF NOT EXISTS public.stage2_workbench_log (
  id BIGSERIAL PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  version_after INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage2_log_team ON public.stage2_workbench_log(team_id);

-- 3. Canonical Event State Table
CREATE TABLE IF NOT EXISTS public.event_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  total_paused_ms BIGINT NOT NULL DEFAULT 0,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  cap_minutes INTEGER NOT NULL DEFAULT 90,
  mode TEXT NOT NULL DEFAULT 'self_paced',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.event_state (id, started_at, paused_at, total_paused_ms, is_paused, cap_minutes, mode, updated_at)
VALUES (1, NULL, NULL, 0, FALSE, 90, 'self_paced', now())
ON CONFLICT (id) DO NOTHING;

-- 4. Hint Config additions
ALTER TABLE public.hint_config ADD COLUMN IF NOT EXISTS edited_by_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.hint_config ADD COLUMN IF NOT EXISTS updated_by TEXT DEFAULT NULL;

-- 5. Enable RLS
ALTER TABLE public.stage2_workbench ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage2_workbench_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_state ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies
DROP POLICY IF EXISTS "service_role_all_stage2_workbench" ON public.stage2_workbench;
CREATE POLICY "service_role_all_stage2_workbench" ON public.stage2_workbench FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_stage2_workbench_log" ON public.stage2_workbench_log;
CREATE POLICY "service_role_all_stage2_workbench_log" ON public.stage2_workbench_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_event_state" ON public.event_state;
CREATE POLICY "service_role_all_event_state" ON public.event_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Stored Functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.stage2_get_workbench(p_team_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT payload_loaded, steps, version, updated_at
  INTO v_rec
  FROM public.stage2_workbench
  WHERE team_id = p_team_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'payloadLoaded', false,
      'steps', '[]'::jsonb,
      'version', 1
    );
  END IF;

  RETURN jsonb_build_object(
    'payloadLoaded', v_rec.payload_loaded,
    'steps', v_rec.steps,
    'version', v_rec.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stage2_save_workbench(
  p_team_id TEXT,
  p_payload_loaded BOOLEAN,
  p_steps JSONB,
  p_expected_version INTEGER,
  p_action TEXT DEFAULT 'apply',
  p_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version INTEGER;
  v_new_version INTEGER;
BEGIN
  SELECT version INTO v_current_version
  FROM public.stage2_workbench
  WHERE team_id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version IS NOT NULL AND p_expected_version > 1 THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'currentVersion', 1);
    END IF;
    v_new_version := 2;
    INSERT INTO public.stage2_workbench (team_id, payload_loaded, steps, version, updated_at)
    VALUES (p_team_id, p_payload_loaded, p_steps, v_new_version, now());
  ELSE
    IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'currentVersion', v_current_version);
    END IF;
    v_new_version := v_current_version + 1;
    UPDATE public.stage2_workbench
    SET payload_loaded = p_payload_loaded,
        steps = p_steps,
        version = v_new_version,
        updated_at = now()
    WHERE team_id = p_team_id;
  END IF;

  INSERT INTO public.stage2_workbench_log (team_id, action, details, version_after, created_at)
  VALUES (p_team_id, p_action, p_details, v_new_version, now());

  RETURN jsonb_build_object(
    'ok', true,
    'state', jsonb_build_object(
      'payloadLoaded', p_payload_loaded,
      'steps', p_steps,
      'version', v_new_version
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_schema_version()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(version), 0) FROM public.schema_version;
$$;

-- Record migration 5 in schema_version
INSERT INTO public.schema_version (version, applied_at)
VALUES (5, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();


-- ==============================================================================
-- FILE: 006_stage1_hints.sql
-- ==============================================================================

-- 1. Create Hint Policy Table
CREATE TABLE IF NOT EXISTS public.hint_policy (
  stage INTEGER PRIMARY KEY CHECK (stage >= 1 AND stage <= 6),
  kind TEXT NOT NULL CHECK (kind IN ('chart', 'text')),
  max_uses INTEGER NULL, -- NULL = unlimited uses (Stage 1)
  cost_schedule_minutes INTEGER[] NOT NULL DEFAULT '{3,5}'::integer[],
  display_seconds INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT true,
  edited_by_admin BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Seed Initial Policies (idempotent, preserves admin modifications)
INSERT INTO public.hint_policy (stage, kind, max_uses, cost_schedule_minutes, display_seconds, enabled, edited_by_admin)
VALUES
  (1, 'chart', NULL, '{3,5}'::integer[], 30, true, false),
  (2, 'text', 2, '{3,5}'::integer[], 0, true, false),
  (3, 'text', 2, '{3,5}'::integer[], 0, true, false),
  (4, 'text', 2, '{3,5}'::integer[], 0, true, false),
  (5, 'text', 2, '{3,5}'::integer[], 0, true, false),
  (6, 'text', 2, '{3,5}'::integer[], 0, true, false)
ON CONFLICT (stage) DO UPDATE SET
  kind = EXCLUDED.kind,
  max_uses = EXCLUDED.max_uses,
  cost_schedule_minutes = EXCLUDED.cost_schedule_minutes,
  display_seconds = EXCLUDED.display_seconds,
  enabled = EXCLUDED.enabled
WHERE hint_policy.edited_by_admin = false;

-- 3. Delete legacy Stage 1 text hints from hint_config
DELETE FROM public.hint_config WHERE stage = 1;

-- 4. Lift CHECK ("hintNumber" IN (1, 2)) on hint_usage, hint_config, and ("hintsUsed" <= 2) on progress
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop hintNumber check constraints on hint_usage and hint_config
  FOR r IN (
    SELECT conname, relname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('hint_usage', 'hint_config')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%hintNumber%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.relname) || ' DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;

  -- Drop hintsUsed check constraint on progress
  FOR r IN (
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'progress'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%hintsUsed%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.progress DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.progress ADD CONSTRAINT progress_hintsUsed_check CHECK ("hintsUsed" >= 0);

-- 5. Ensure Unique Indexes and Columns on hint_usage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hint_usage' AND column_name = 'idempotencyKey'
  ) THEN
    ALTER TABLE public.hint_usage ADD COLUMN "idempotencyKey" TEXT DEFAULT NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_hint_usage_team_stage_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hint_usage_team_stage_number ON public.hint_usage("teamId", stage, "hintNumber");

DROP INDEX IF EXISTS idx_hint_usage_team_idemp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hint_usage_team_idemp ON public.hint_usage("teamId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- 6. Replace request_hint Function (Single transaction, atomic)
-- Explicitly drop any legacy or overloaded request_hint functions to prevent error 42725
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'request_hint'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.request_hint(
  p_team_id text,
  p_stage integer,
  p_idempotency_key text DEFAULT NULL,
  p_now bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now bigint;
  v_team public.teams%ROWTYPE;
  v_policy public.hint_policy%ROWTYPE;
  v_active_usage public.hint_usage%ROWTYPE;
  v_idemp_usage public.hint_usage%ROWTYPE;
  v_hint_row public.hint_config%ROWTYPE;
  v_uses_count integer;
  v_next_num integer;
  v_sched_len integer;
  v_cost_idx integer;
  v_cost integer;
  v_duration_ms bigint;
  v_visible_until bigint;
  v_content_text text := '';
  v_new_penalty integer;
  v_next_cost_idx integer;
  v_next_cost integer;
BEGIN
  -- Determine current timestamp
  v_now := coalesce(p_now, (extract(epoch from clock_timestamp()) * 1000)::bigint);

  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_idemp_usage FROM public.hint_usage
    WHERE "teamId" = p_team_id AND "idempotencyKey" = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
      SELECT * INTO v_policy FROM public.hint_policy WHERE stage = v_idemp_usage.stage;
      RETURN jsonb_build_object(
        'ok', true,
        'success', true,
        'idempotent', true,
        'kind', v_policy.kind,
        'visibleUntil', v_idemp_usage."visibleUntil",
        'costMinutes', v_idemp_usage."penaltyCharged",
        'penaltyMin', v_team."penaltyMin",
        'useNumber', v_idemp_usage."hintNumber"
      );
    END IF;
  END IF;

  -- 2. Lock Team Row
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Team not found.');
  END IF;

  IF v_team."finishedAt" IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Mission already completed.');
  END IF;

  IF v_team.status = 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Game has not started yet.');
  END IF;

  IF v_team."isPaused" = 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Game is paused by organisers.');
  END IF;

  IF v_team.stage != p_stage THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Stage mismatch.');
  END IF;

  -- 3. Fetch Hint Policy
  SELECT * INTO v_policy FROM public.hint_policy WHERE stage = p_stage;
  IF NOT FOUND OR NOT v_policy.enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hints are not enabled for this stage.');
  END IF;

  -- 4. Check If Active Window Is Already Open (Return without charging) - only for temporary timed displays
  IF v_policy.kind = 'chart' OR v_policy.display_seconds > 0 THEN
    SELECT * INTO v_active_usage FROM public.hint_usage
    WHERE "teamId" = p_team_id AND stage = p_stage AND "visibleUntil" > v_now
    ORDER BY "shownAt" DESC LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'success', true,
        'alreadyActive', true,
        'kind', v_policy.kind,
        'visibleUntil', v_active_usage."visibleUntil",
        'serverNow', v_now,
        'costMinutes', 0,
        'useNumber', v_active_usage."hintNumber",
        'newPenaltyMinutes', v_team."penaltyMin"
      );
    END IF;
  END IF;

  -- 5. Count Uses & Check Max Uses
  SELECT count(*)::integer INTO v_uses_count FROM public.hint_usage
  WHERE "teamId" = p_team_id AND stage = p_stage;

  IF v_policy.max_uses IS NOT NULL AND v_uses_count >= v_policy.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Maximum hints reached for this stage.');
  END IF;

  -- 6. Calculate Next Use & Cost
  v_next_num := v_uses_count + 1;
  v_sched_len := array_length(v_policy.cost_schedule_minutes, 1);
  IF v_sched_len IS NULL OR v_sched_len = 0 THEN
    v_cost := 3;
  ELSE
    v_cost_idx := least(v_next_num, v_sched_len);
    v_cost := v_policy.cost_schedule_minutes[v_cost_idx];
  END IF;

  v_duration_ms := (v_policy.display_seconds * 1000)::bigint;
  IF v_duration_ms > 0 THEN
    v_visible_until := v_now + v_duration_ms;
  ELSE
    v_visible_until := 0;
  END IF;

  -- 7. If text hint, fetch hint_config
  IF v_policy.kind = 'text' THEN
    SELECT * INTO v_hint_row FROM public.hint_config
    WHERE stage = p_stage AND "hintNumber" = v_next_num AND enabled = 1;
    v_content_text := coalesce(v_hint_row.text, '');
  END IF;

  -- 8. Insert Usage
  INSERT INTO public.hint_usage (
    "teamId", stage, "hintId", "hintNumber", "penaltyCharged", "shownAt", "visibleUntil", "idempotencyKey"
  ) VALUES (
    p_team_id,
    p_stage,
    coalesce(v_hint_row.id, 'stage_' || p_stage || '_hint_' || v_next_num),
    v_next_num,
    v_cost,
    v_now,
    v_visible_until,
    p_idempotency_key
  );

  -- 9. Update Team Penalty & Version
  UPDATE public.teams
  SET "penaltyMin" = "penaltyMin" + v_cost,
      version = version + 1
  WHERE id = p_team_id
  RETURNING "penaltyMin" INTO v_new_penalty;

  -- 10. Update Progress hintsUsed
  INSERT INTO public.progress ("teamId", stage, "hintsUsed")
  VALUES (p_team_id, p_stage, v_next_num)
  ON CONFLICT ("teamId", stage) DO UPDATE SET "hintsUsed" = v_next_num;

  -- 11. Calculate Next Cost
  IF v_sched_len IS NULL OR v_sched_len = 0 THEN
    v_next_cost := 5;
  ELSE
    v_next_cost_idx := least(v_next_num + 1, v_sched_len);
    v_next_cost := v_policy.cost_schedule_minutes[v_next_cost_idx];
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'kind', v_policy.kind,
    'content', v_content_text,
    'visibleUntil', v_visible_until,
    'serverNow', v_now,
    'costMinutes', v_cost,
    'useNumber', v_next_num,
    'usesTotal', v_next_num,
    'nextCostMinutes', v_next_cost,
    'newPenaltyMinutes', v_new_penalty
  );
END;
$$;

-- 7. Security Policies & Privileges
ALTER TABLE public.hint_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hint_policy FROM anon, authenticated;
GRANT ALL ON public.hint_policy TO service_role;

DROP POLICY IF EXISTS "service_role_all_hint_policy" ON public.hint_policy;
CREATE POLICY "service_role_all_hint_policy" ON public.hint_policy FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.request_hint(text, integer, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_hint(text, integer, text, bigint) TO service_role;

-- Record migration 6 in schema_version
INSERT INTO public.schema_version (version, applied_at)
VALUES (6, clock_timestamp())
ON CONFLICT (version) DO UPDATE SET applied_at = clock_timestamp();
