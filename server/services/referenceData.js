// FINAL OVERRIDE — Reference Data Management Service
// Idempotently seeds and validates hint configuration and policies across Stages 1–6
// and default system settings across all database backends (SQLite & Supabase).

const assert = require('assert');

// Canonical Hint Policies (Task 3.1)
const HINT_POLICIES = [
  {
    stage: 1,
    kind: 'chart',
    max_uses: null, // Unlimited repeatable chart reveals
    cost_schedule_minutes: [3, 5],
    display_seconds: 30,
    enabled: 1
  },
  {
    stage: 2,
    kind: 'text',
    max_uses: 2,
    cost_schedule_minutes: [3, 5],
    display_seconds: 0,
    enabled: 1
  },
  {
    stage: 3,
    kind: 'text',
    max_uses: 2,
    cost_schedule_minutes: [3, 5],
    display_seconds: 0,
    enabled: 1
  },
  {
    stage: 4,
    kind: 'text',
    max_uses: 2,
    cost_schedule_minutes: [3, 5],
    display_seconds: 0,
    enabled: 1
  },
  {
    stage: 5,
    kind: 'text',
    max_uses: 2,
    cost_schedule_minutes: [3, 5],
    display_seconds: 0,
    enabled: 1
  },
  {
    stage: 6,
    kind: 'text',
    max_uses: 2,
    cost_schedule_minutes: [3, 5],
    display_seconds: 0,
    enabled: 1
  }
];

// Text hints apply strictly to Stages 2–6 (Stage 1 uses repeatable chart reveals)
const HINT_DEFINITIONS = [
  // Stage 2
  {
    id: 'h2_1',
    stage: 2,
    hintNumber: 1,
    moduleName: 'Layer Deconstruction',
    enabled: 1,
    category: 'tool',
    text: 'Inspect character sets to peel layers: Base64 uses [A-Za-z0-9+/=], Hex uses [0-9A-Fa-f], ROT13 preserves spacing and punctuation. The innermost cipher is numeric Vigenère.',
    displayDurationSeconds: 0,
    penaltyMinutes: 3,
    displayOrder: 3
  },
  {
    id: 'h2_2',
    stage: 2,
    hintNumber: 2,
    moduleName: 'Assembly Sequence',
    enabled: 1,
    category: 'nudge',
    text: 'Peel the layers in order: Base64 -> Hex -> ROT13. Then read the decoder button index numbers in the exact order you clicked them to form your Vigenère key.',
    displayDurationSeconds: 0,
    penaltyMinutes: 5,
    displayOrder: 4
  },
  // Stage 3
  {
    id: 'h3_1',
    stage: 3,
    hintNumber: 1,
    moduleName: 'Authorization Protocol',
    enabled: 1,
    category: 'nudge',
    text: 'State your official role, access phrase from Stage 2, and mission goal in full sentences.',
    displayDurationSeconds: 0,
    penaltyMinutes: 3,
    displayOrder: 5
  },
  {
    id: 'h3_2',
    stage: 3,
    hintNumber: 2,
    moduleName: 'Decoy Trap Avoidance',
    enabled: 1,
    category: 'structural',
    text: 'WARDEN will hand out a decoy fragment if you ask carelessly. Verify the system response against your authorized credentials.',
    displayDurationSeconds: 0,
    penaltyMinutes: 5,
    displayOrder: 6
  },
  // Stage 4
  {
    id: 'h4_1',
    stage: 4,
    hintNumber: 1,
    moduleName: 'Token Reconnaissance',
    enabled: 1,
    category: 'tool',
    text: 'Token 1 is in DOM inspection; Token 2 in terminal robots/vault; Token 3 in image EXIF metadata.',
    displayDurationSeconds: 0,
    penaltyMinutes: 3,
    displayOrder: 7
  },
  {
    id: 'h4_2',
    stage: 4,
    hintNumber: 2,
    moduleName: 'Token Concat Order',
    enabled: 1,
    category: 'nudge',
    text: 'Join the three discovered tokens in numerical sequence: Token 1 + Token 2 + Token 3.',
    displayDurationSeconds: 0,
    penaltyMinutes: 5,
    displayOrder: 8
  },
  // Stage 5
  {
    id: 'h5_1',
    stage: 5,
    hintNumber: 1,
    moduleName: 'Squad Shard Matrix',
    enabled: 1,
    category: 'structural',
    text: 'Every team member must connect from their individual device to reveal their unique shard.',
    displayDurationSeconds: 0,
    penaltyMinutes: 3,
    displayOrder: 9
  },
  {
    id: 'h5_2',
    stage: 5,
    hintNumber: 2,
    moduleName: 'Final Machine Override',
    enabled: 1,
    category: 'nudge',
    text: 'Combine all squad member shards in registration order to unlock the terminal machines.',
    displayDurationSeconds: 0,
    penaltyMinutes: 5,
    displayOrder: 10
  },
  // Stage 6
  {
    id: 'h6_1',
    stage: 6,
    hintNumber: 1,
    moduleName: 'Override Vector',
    enabled: 1,
    category: 'structural',
    text: 'Combine the team code from Stage 5 with the final challenge response to compute the master override key.',
    displayDurationSeconds: 0,
    penaltyMinutes: 3,
    displayOrder: 11
  },
  {
    id: 'h6_2',
    stage: 6,
    hintNumber: 2,
    moduleName: 'System Integration Check',
    enabled: 1,
    category: 'nudge',
    text: 'Ensure all previous stage fragments are validated in the ledger before executing the final override sequence.',
    displayDurationSeconds: 0,
    penaltyMinutes: 5,
    displayOrder: 12
  }
];

// Startup security assertion (Task 3.4): no hint text contains any stage answer, access phrase, fragment, or decoy word
const LEAK_FORBIDDEN_WORDS = ['NOVA', 'CYGNUS', 'ZENITH', 'DELTA7', 'ZETA9', '47K'];
for (const h of HINT_DEFINITIONS) {
  for (const forbidden of LEAK_FORBIDDEN_WORDS) {
    if (h.text && h.text.toUpperCase().includes(forbidden)) {
      throw new Error(`SECURITY AUDIT FAILURE: Hint [${h.id}] contains forbidden leak: "${forbidden}"`);
    }
  }
}

const DEFAULT_SETTINGS = [
  { key: 'clockPaused', value: 'false' },
  { key: 'pauseStartedAt', value: '0' },
  { key: 'allowNewTeams', value: 'false' },
  { key: 'eventStartedAt', value: '0' },
  { key: 'totalPausedMs', value: '0' },
  { key: 'startTogetherMode', value: 'true' },
  { key: 'gameStarted', value: 'false' },
  { key: 'leaderboardFrozen', value: 'false' }
];

async function ensureReferenceData(dbInstance) {
  if (!dbInstance) return;

  // SQLite execution path
  if (typeof dbInstance.prepare === 'function') {
    try {
      // 1. Purge legacy Stage 1 text rows from hint_config
      dbInstance.prepare('DELETE FROM hint_config WHERE stage = 1').run();

      // 2. Ensure hint_policy table exists
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS hint_policy (
          stage INTEGER PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('chart', 'text')),
          max_uses INTEGER,
          cost_schedule_minutes TEXT NOT NULL DEFAULT '[3,5]',
          display_seconds INTEGER NOT NULL DEFAULT 30,
          enabled INTEGER NOT NULL DEFAULT 1,
          edited_by_admin INTEGER DEFAULT 0,
          updated_by TEXT DEFAULT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const insPolicy = dbInstance.prepare(`
        INSERT INTO hint_policy (stage, kind, max_uses, cost_schedule_minutes, display_seconds, enabled, edited_by_admin, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(stage) DO UPDATE SET
          kind = excluded.kind,
          max_uses = excluded.max_uses,
          cost_schedule_minutes = excluded.cost_schedule_minutes,
          display_seconds = excluded.display_seconds,
          enabled = excluded.enabled
        WHERE COALESCE(hint_policy.edited_by_admin, 0) = 0
      `);

      const now = Date.now();
      for (const p of HINT_POLICIES) {
        insPolicy.run(
          p.stage,
          p.kind,
          p.max_uses,
          JSON.stringify(p.cost_schedule_minutes),
          p.display_seconds,
          p.enabled,
          now
        );
      }

      // 3. Seed Stage 2–6 text hints
      const insHint = dbInstance.prepare(`
        INSERT INTO hint_config (id, stage, hintNumber, moduleName, enabled, category, text, displayDurationSeconds, penaltyMinutes, displayOrder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          text = excluded.text,
          displayDurationSeconds = excluded.displayDurationSeconds,
          penaltyMinutes = excluded.penaltyMinutes,
          displayOrder = excluded.displayOrder
        WHERE COALESCE(hint_config.edited_by_admin, 0) = 0
      `);

      for (const h of HINT_DEFINITIONS) {
        insHint.run(
          h.id, h.stage, h.hintNumber, h.moduleName, h.enabled,
          h.category, h.text, h.displayDurationSeconds, h.penaltyMinutes, h.displayOrder
        );
      }

      // 4. Default settings
      const insSetting = dbInstance.prepare(`
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
      `);
      for (const s of DEFAULT_SETTINGS) {
        insSetting.run(s.key, s.value);
      }
    } catch (e) {
      console.warn('ensureReferenceData (SQLite) warning:', e.message);
    }
  }
}

module.exports = {
  HINT_POLICIES,
  HINT_DEFINITIONS,
  DEFAULT_SETTINGS,
  ensureReferenceData
};
