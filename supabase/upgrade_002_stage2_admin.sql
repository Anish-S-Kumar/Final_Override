-- ==============================================================================
-- FINAL OVERRIDE — UPGRADE 002: STAGE 2 WORKBENCH & EVENT STATE
-- For manual execution in Supabase Dashboard -> SQL Editor
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
