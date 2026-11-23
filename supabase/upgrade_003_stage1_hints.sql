-- ==============================================================================
-- FINAL OVERRIDE — UPGRADE 003: STAGE 1 REPEATABLE MORSE CHART & HINT POLICIES
-- Paste into Supabase Dashboard -> SQL Editor and click "Run".
-- Safe to re-run multiple times (fully idempotent).
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

-- Reload Supabase Schema Cache
NOTIFY pgrst, 'reload schema';
