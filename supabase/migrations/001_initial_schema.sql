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
