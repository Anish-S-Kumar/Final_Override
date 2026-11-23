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

-- 6. request_hint
CREATE OR REPLACE FUNCTION public.request_hint(
  p_team_id text,
  p_stage integer,
  p_hint_number integer,
  p_shown_at bigint,
  p_visible_until bigint,
  p_penalty_charged integer,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hint_config public.hint_config%ROWTYPE;
  v_usage_id bigint;
  v_existing public.hint_usage%ROWTYPE;
BEGIN
  -- Check existing usage for this hint
  SELECT * INTO v_existing FROM public.hint_usage
  WHERE "teamId" = p_team_id AND stage = p_stage AND "hintNumber" = p_hint_number;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyUsed', true,
      'visibleUntil', v_existing."visibleUntil",
      'penaltyCharged', v_existing."penaltyCharged"
    );
  END IF;

  SELECT * INTO v_hint_config FROM public.hint_config
  WHERE stage = p_stage AND "hintNumber" = p_hint_number AND enabled = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hint configuration not found or disabled');
  END IF;

  INSERT INTO public.hint_usage (
    "teamId", stage, "hintId", "hintNumber", "penaltyCharged", "shownAt", "visibleUntil", "idempotencyKey"
  ) VALUES (
    p_team_id, p_stage, v_hint_config.id, p_hint_number, p_penalty_charged, p_shown_at, p_visible_until, p_idempotency_key
  ) RETURNING id INTO v_usage_id;

  -- Update team penalty & progress hint count
  UPDATE public.teams
  SET "penaltyMin" = "penaltyMin" + p_penalty_charged,
      version = version + 1
  WHERE id = p_team_id;

  UPDATE public.progress
  SET "hintsUsed" = "hintsUsed" + 1
  WHERE "teamId" = p_team_id AND stage = p_stage;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyUsed', false,
    'hintId', v_hint_config.id,
    'hintText', v_hint_config.text,
    'visibleUntil', p_visible_until,
    'penaltyCharged', p_penalty_charged
  );
END;
$$;

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
