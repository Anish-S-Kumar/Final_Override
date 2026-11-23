// FINAL OVERRIDE — SQLite Repository Implementation
// High-concurrency, transaction-safe database layer with prepared statement caching and WAL support.
const db = require('../db');
const mission = require('../content/mission');
const { ensureReferenceData } = require('../services/referenceData');

const STAGE1_MEMORISE_MS = (mission.stage1?.memoriseSeconds || 300) * 1000;

class SQLiteRepository {
  constructor() {
    this.db = db;
    this.ensurePragmas();
    this.seedDefaultHintConfig();
  }

  ensurePragmas() {
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
  }

  seedDefaultHintConfig() {
    if (!this.db) return;
    try {
      ensureReferenceData(this.db);
    } catch (_) { }
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  async getSetting(key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  async getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() || [];
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  }

  async setSetting(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    return true;
  }

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------
  async getTeamByToken(token) {
    if (!token) return null;
    return this.db.prepare('SELECT * FROM teams WHERE sessionToken = ?').get(token) || null;
  }

  async getTeamById(id) {
    if (!id) return null;
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) || null;
  }

  async getTeamByName(name) {
    if (!name) return null;
    return this.db.prepare('SELECT * FROM teams WHERE name = ? COLLATE NOCASE').get(name.trim()) || null;
  }

  async getAllTeams() {
    return this.db.prepare('SELECT * FROM teams ORDER BY startedAt DESC').all() || [];
  }

  async getWaitingTeamsCount() {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM teams WHERE status = 'waiting'").get();
    return row ? row.c : 0;
  }

  async createTeam({ team, members, stages = 5, sequence }) {
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO teams (id, name, coordinator, startedAt, finishedAt, stage, penaltyMin, pausedMs, sessionToken, status, isPaused, teamPauseStartedAt, tabSwitches, seed, version, stage1EnteredAt, stage1OpensAt, memberCount)
        VALUES (?, ?, ?, ?, NULL, 1, 0, 0, ?, ?, 0, 0, 0, ?, 1, ?, ?, ?)
      `).run(
        team.id,
        team.name,
        team.coordinator,
        team.startedAt,
        team.sessionToken || null,
        team.status || 'active',
        team.seed || null,
        team.stage1EnteredAt || team.startedAt,
        team.stage1OpensAt || (team.startedAt + STAGE1_MEMORISE_MS),
        team.memberCount || members.length
      );

      const insMember = this.db.prepare(`
        INSERT INTO members (id, teamId, fullName, isLeader, deviceToken, codeType, assignedCode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of members) {
        insMember.run(m.id, m.teamId || team.id, m.fullName, m.isLeader ? 1 : 0, m.deviceToken || null, m.codeType || null, m.assignedCode || null);
      }

      if (sequence) {
        this.db.prepare(`
          INSERT INTO team_sequences (teamId, fragmentOrder, expectedAnswer, createdAt)
          VALUES (?, ?, ?, ?)
        `).run(team.id, JSON.stringify(sequence.fragmentOrder), sequence.expectedAnswer, Date.now());
      }

      const insProg = this.db.prepare(`
        INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt)
        VALUES (?, ?, NULL, 0, 0, NULL)
      `);
      for (let s = 1; s <= stages; s++) {
        insProg.run(team.id, s);
      }
    });

    tx();
    return team;
  }

  async updateTeam(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;

    // Increment version on state change
    const updateKeys = [...keys];
    const updateVals = keys.map(k => fields[k]);
    if (!updateKeys.includes('version')) {
      const current = await this.getTeamById(id);
      updateKeys.push('version');
      updateVals.push((current?.version || 1) + 1);
    }
    updateVals.push(id);

    const setClause = updateKeys.map(k => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`).run(...updateVals);
    return true;
  }

  async deleteTeam(id) {
    this.db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    return true;
  }

  async addPausedMsToActiveTeams(duration) {
    if (duration <= 0) return true;
    this.db.prepare('UPDATE teams SET pausedMs = pausedMs + ?, version = version + 1 WHERE finishedAt IS NULL').run(duration);
    return true;
  }

  async startAllTeams(now) {
    this.setSetting('gameStarted', 'true');
    this.setSetting('eventStartedAt', String(now));
    this.setSetting('clockPaused', 'false');
    this.setSetting('pauseStartedAt', '0');

    const res = this.db.prepare(`
      UPDATE teams
      SET status = 'active', startedAt = ?, stage1EnteredAt = ?, stage1OpensAt = ?, version = version + 1
      WHERE status = 'waiting'
    `).run(now, now, now + STAGE1_MEMORISE_MS);
    return res.changes;
  }

  async restartAllTeams(mode, now) {
    const targetStatus = mode === 'active' ? 'active' : 'waiting';
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM submissions').run();
      this.db.prepare('DELETE FROM chat').run();
      this.db.prepare('DELETE FROM violations').run();
      this.db.prepare('DELETE FROM hint_usage').run();
      this.db.prepare('DELETE FROM progress').run();

      const teams = this.db.prepare('SELECT id FROM teams').all() || [];
      const insProg = this.db.prepare('INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt) VALUES (?, ?, NULL, 0, 0, NULL)');
      for (const t of teams) {
        for (let s = 1; s <= 5; s++) {
          insProg.run(t.id, s);
        }
      }

      this.db.prepare(`
        UPDATE teams
        SET stage = 1, finishedAt = NULL, penaltyMin = 0, pausedMs = 0, tabSwitches = 0,
            status = ?, startedAt = ?, stage1EnteredAt = ?, stage1OpensAt = ?, version = version + 1
      `).run(targetStatus, now, now, now + STAGE1_MEMORISE_MS);
    });
    tx();
    return true;
  }

  async resetTeam(id) {
    const now = Date.now();
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM submissions WHERE teamId = ?').run(id);
      this.db.prepare('DELETE FROM chat WHERE teamId = ?').run(id);
      this.db.prepare('DELETE FROM violations WHERE teamId = ?').run(id);
      this.db.prepare('DELETE FROM hint_usage WHERE teamId = ?').run(id);
      this.db.prepare('UPDATE progress SET fragment = NULL, wrongAttempts = 0, hintsUsed = 0, solvedAt = NULL WHERE teamId = ?').run(id);
      this.db.prepare(`
        UPDATE teams
        SET stage = 1, finishedAt = NULL, penaltyMin = 0, pausedMs = 0, tabSwitches = 0,
            startedAt = ?, stage1EnteredAt = ?, stage1OpensAt = ?, version = version + 1
        WHERE id = ?
      `).run(now, now, now + STAGE1_MEMORISE_MS, id);
    });
    tx();
    return true;
  }

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async getMembers(teamId) {
    return this.db.prepare('SELECT * FROM members WHERE teamId = ?').all(teamId) || [];
  }

  async getMemberById(id) {
    return this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) || null;
  }

  async updateMember(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    this.db.prepare(`UPDATE members SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  }

  // --------------------------------------------------------------------------
  // Team Sequences (Stage 2)
  // --------------------------------------------------------------------------
  async getTeamSequence(teamId) {
    const row = this.db.prepare('SELECT * FROM team_sequences WHERE teamId = ?').get(teamId);
    if (!row) return null;
    return {
      teamId: row.teamId,
      fragmentOrder: JSON.parse(row.fragmentOrder),
      expectedAnswer: row.expectedAnswer,
      createdAt: row.createdAt
    };
  }

  async setTeamSequence(teamId, fragmentOrder, expectedAnswer) {
    this.db.prepare(`
      INSERT OR REPLACE INTO team_sequences (teamId, fragmentOrder, expectedAnswer, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(teamId, JSON.stringify(fragmentOrder), expectedAnswer, Date.now());
    return true;
  }

  async getMembersForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const placeholders = teamIds.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM members WHERE teamId IN (${placeholders})`).all(...teamIds) || [];
  }

  async getMemberByDeviceToken(deviceToken) {
    if (!deviceToken) return null;
    return this.db.prepare('SELECT * FROM members WHERE deviceToken = ?').get(deviceToken) || null;
  }

  async assignDeviceToken(memberId, deviceToken) {
    this.db.prepare('UPDATE members SET deviceToken = ? WHERE id = ?').run(deviceToken, memberId);
    return true;
  }

  async resetMemberDevice(memberId) {
    this.db.prepare('UPDATE members SET deviceToken = NULL WHERE id = ?').run(memberId);
    return true;
  }

  async resetAllMemberDevices(teamId) {
    this.db.prepare('UPDATE members SET deviceToken = NULL WHERE teamId = ?').run(teamId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Progress
  // --------------------------------------------------------------------------
  async getProgress(teamId) {
    return this.db.prepare('SELECT * FROM progress WHERE teamId = ? ORDER BY stage ASC').all(teamId) || [];
  }

  async getProgressForStage(teamId, stage) {
    return this.db.prepare('SELECT * FROM progress WHERE teamId = ? AND stage = ?').get(teamId, stage) || null;
  }

  async getProgressForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const placeholders = teamIds.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM progress WHERE teamId IN (${placeholders}) ORDER BY stage ASC`).all(...teamIds) || [];
  }

  async resetTeamProgress(teamId, now) {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE progress SET fragment = NULL, wrongAttempts = 0, hintsUsed = 0, solvedAt = NULL WHERE teamId = ?').run(teamId);
      this.db.prepare(`
        UPDATE teams
        SET stage = 1, finishedAt = NULL, penaltyMin = 0, pausedMs = 0, tabSwitches = 0,
            startedAt = ?, stage1EnteredAt = ?, stage1OpensAt = ?, version = version + 1
        WHERE id = ?
      `).run(now, now, now + STAGE1_MEMORISE_MS, teamId);
    });
    tx();
    return true;
  }

  async updateProgress(teamId, stage, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(teamId, stage);
    this.db.prepare(`UPDATE progress SET ${setClause} WHERE teamId = ? AND stage = ?`).run(...values);
    return true;
  }

  // --------------------------------------------------------------------------
  // Submissions
  // --------------------------------------------------------------------------
  async addSubmission({ teamId, stage, valueHash, rawValue, ok, at, idempotencyKey = null }) {
    const res = this.db.prepare(`
      INSERT INTO submissions (teamId, stage, valueHash, rawValue, ok, at, idempotencyKey)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, stage, valueHash, rawValue, ok, at, idempotencyKey);
    return res.lastInsertRowid;
  }

  async getSubmissions(teamId) {
    return this.db.prepare('SELECT * FROM submissions WHERE teamId = ? ORDER BY at DESC').all(teamId) || [];
  }

  async getAllSubmissions() {
    return this.db.prepare('SELECT * FROM submissions ORDER BY at DESC').all() || [];
  }

  // --------------------------------------------------------------------------
  // Violations
  // --------------------------------------------------------------------------
  async addViolation({ id, teamId, stage = 0, type, details = null, penaltyAdded = 0, at }) {
    const res = this.db.prepare(`
      INSERT INTO violations (teamId, stage, type, details, penaltyAdded, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(teamId, stage, type, details, penaltyAdded, at);
    return res.lastInsertRowid;
  }

  async getViolations(limit = 50) {
    return this.db.prepare('SELECT * FROM violations ORDER BY at DESC LIMIT ?').all(limit) || [];
  }

  async getAllViolations() {
    return this.db.prepare('SELECT * FROM violations ORDER BY at DESC').all() || [];
  }

  async getTabViolationsCount(teamId, stage = null) {
    if (stage) {
      const row = this.db.prepare("SELECT COUNT(*) as c FROM violations WHERE teamId = ? AND type = 'tab_switch' AND stage = ?").get(teamId, stage);
      return row ? row.c : 0;
    }
    const row = this.db.prepare("SELECT COUNT(*) as c FROM violations WHERE teamId = ? AND type = 'tab_switch'").get(teamId);
    return row ? row.c : 0;
  }

  async getLastTabViolation(teamId) {
    return this.db.prepare("SELECT * FROM violations WHERE teamId = ? AND type = 'tab_switch' ORDER BY at DESC LIMIT 1").get(teamId) || null;
  }

  async deleteViolation(id) {
    this.db.prepare('DELETE FROM violations WHERE id = ?').run(id);
    return true;
  }

  // --------------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------------
  async addChat({ teamId, role, text, at }) {
    const res = this.db.prepare('INSERT INTO chat (teamId, role, text, at) VALUES (?, ?, ?, ?)').run(teamId, role, text, at);
    return res.lastInsertRowid;
  }

  async getChat(teamId) {
    return this.db.prepare('SELECT * FROM chat WHERE teamId = ? ORDER BY at ASC').all(teamId) || [];
  }

  async getChatHistory(teamId) {
    return this.getChat(teamId);
  }

  async getRecentChatCount(teamId, role, sinceTime) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM chat WHERE teamId = ? AND role = ? AND at > ?').get(teamId, role, sinceTime);
    return row ? row.c : 0;
  }

  async getRecentWardenLogs(limit = 60) {
    return this.db.prepare(`
      SELECT c.id, c.teamId, t.name as teamName, c.role, c.text, c.at
      FROM chat c
      LEFT JOIN teams t ON c.teamId = t.id
      ORDER BY c.at DESC LIMIT ?
    `).all(limit) || [];
  }

  // --------------------------------------------------------------------------
  // Hint Configuration & Usage
  // --------------------------------------------------------------------------
  async getAllHintConfigs() {
    return this.db.prepare('SELECT * FROM hint_config ORDER BY stage ASC, displayOrder ASC').all() || [];
  }

  async getHintConfig(stage, hintNumber) {
    return this.db.prepare('SELECT * FROM hint_config WHERE stage = ? AND hintNumber = ? AND enabled = 1').get(stage, hintNumber) || null;
  }

  async updateHintConfig(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    this.db.prepare(`UPDATE hint_config SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  }

  async getHintUsage(teamId, stage) {
    return this.db.prepare('SELECT * FROM hint_usage WHERE teamId = ? AND stage = ? ORDER BY shownAt ASC').all(teamId, stage) || [];
  }

  // --------------------------------------------------------------------------
  // Hint Policies & Unified Hint Requests
  // --------------------------------------------------------------------------
  async getHintPolicy(stage) {
    const row = this.db.prepare('SELECT * FROM hint_policy WHERE stage = ?').get(stage);
    if (!row) return null;
    let schedule = [3, 5];
    try {
      schedule = JSON.parse(row.cost_schedule_minutes || '[3,5]');
    } catch (_) {}
    return {
      stage: row.stage,
      kind: row.kind,
      maxUses: row.max_uses,
      costScheduleMinutes: schedule,
      displaySeconds: row.display_seconds,
      enabled: Boolean(row.enabled),
      editedByAdmin: Boolean(row.edited_by_admin),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    };
  }

  async getAllHintPolicies() {
    const rows = this.db.prepare('SELECT * FROM hint_policy ORDER BY stage ASC').all() || [];
    return rows.map(row => {
      let schedule = [3, 5];
      try {
        schedule = JSON.parse(row.cost_schedule_minutes || '[3,5]');
      } catch (_) {}
      return {
        stage: row.stage,
        kind: row.kind,
        maxUses: row.max_uses,
        costScheduleMinutes: schedule,
        displaySeconds: row.display_seconds,
        enabled: Boolean(row.enabled),
        editedByAdmin: Boolean(row.edited_by_admin),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at
      };
    });
  }

  async updateHintPolicy(stage, updates) {
    const policy = await this.getHintPolicy(stage);
    if (!policy) return false;
    const updateKeys = [];
    const updateVals = [];

    if (updates.kind !== undefined) {
      updateKeys.push('kind = ?');
      updateVals.push(updates.kind);
    }
    if (updates.maxUses !== undefined || updates.max_uses !== undefined) {
      updateKeys.push('max_uses = ?');
      updateVals.push(updates.maxUses !== undefined ? updates.maxUses : updates.max_uses);
    }
    if (updates.costScheduleMinutes !== undefined || updates.cost_schedule_minutes !== undefined) {
      const sched = updates.costScheduleMinutes !== undefined ? updates.costScheduleMinutes : updates.cost_schedule_minutes;
      updateKeys.push('cost_schedule_minutes = ?');
      updateVals.push(typeof sched === 'string' ? sched : JSON.stringify(sched));
    }
    if (updates.displaySeconds !== undefined || updates.display_seconds !== undefined) {
      updateKeys.push('display_seconds = ?');
      updateVals.push(updates.displaySeconds !== undefined ? updates.displaySeconds : updates.display_seconds);
    }
    if (updates.enabled !== undefined) {
      updateKeys.push('enabled = ?');
      updateVals.push(updates.enabled ? 1 : 0);
    }
    if (updates.updatedBy !== undefined || updates.updated_by !== undefined) {
      updateKeys.push('updated_by = ?');
      updateVals.push(updates.updatedBy || updates.updated_by || null);
    }

    updateKeys.push('edited_by_admin = 1');
    updateKeys.push('updated_at = ?');
    updateVals.push(Date.now());
    updateVals.push(stage);

    this.db.prepare(`UPDATE hint_policy SET ${updateKeys.join(', ')} WHERE stage = ?`).run(...updateVals);
    return true;
  }

  async requestHint(teamId, stage, idempotencyKey = null, now = Date.now()) {
    const tx = this.db.transaction(() => {
      // 1. Idempotency Check
      if (idempotencyKey) {
        const idempUsage = this.db.prepare('SELECT * FROM hint_usage WHERE teamId = ? AND idempotencyKey = ?').get(teamId, idempotencyKey);
        if (idempUsage) {
          const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
          const policy = this.db.prepare('SELECT * FROM hint_policy WHERE stage = ?').get(idempUsage.stage);
          return {
            ok: true,
            success: true,
            idempotent: true,
            kind: policy ? policy.kind : 'text',
            visibleUntil: idempUsage.visibleUntil,
            costMinutes: idempUsage.penaltyCharged,
            penaltyMin: team ? team.penaltyMin : 0,
            useNumber: idempUsage.hintNumber
          };
        }
      }

      // 2. Team validations
      const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
      if (!team) return { ok: false, error: 'Team not found.' };
      if (team.finishedAt) return { ok: false, error: 'Mission already completed.' };
      if (team.status === 'waiting') return { ok: false, error: 'Game has not started yet.' };
      if (team.isPaused === 1) return { ok: false, error: 'Game is paused by organisers.' };
      if (team.stage !== stage) return { ok: false, error: 'Stage mismatch.' };

      // 3. Hint Policy
      const policyRow = this.db.prepare('SELECT * FROM hint_policy WHERE stage = ?').get(stage);
      if (!policyRow || !policyRow.enabled) {
        return { ok: false, error: 'Hints are not enabled for this stage.' };
      }

      let costSchedule = [3, 5];
      try {
        costSchedule = JSON.parse(policyRow.cost_schedule_minutes || '[3,5]');
      } catch (_) {}

      // 4. Check active window (return without charging) - only for temporary timed displays
      if (policyRow.kind === 'chart' || (policyRow.display_seconds && policyRow.display_seconds > 0)) {
        const activeUsage = this.db.prepare('SELECT * FROM hint_usage WHERE teamId = ? AND stage = ? AND visibleUntil > ? ORDER BY shownAt DESC LIMIT 1').get(teamId, stage, now);
        if (activeUsage) {
          return {
            ok: true,
            success: true,
            alreadyActive: true,
            kind: policyRow.kind,
            visibleUntil: activeUsage.visibleUntil,
            serverNow: now,
            costMinutes: 0,
            useNumber: activeUsage.hintNumber,
            newPenaltyMinutes: team.penaltyMin
          };
        }
      }

      // 5. Count uses and check max uses
      const countRow = this.db.prepare('SELECT count(*) as count FROM hint_usage WHERE teamId = ? AND stage = ?').get(teamId, stage);
      const usesCount = countRow ? countRow.count : 0;
      if (policyRow.max_uses !== null && usesCount >= policyRow.max_uses) {
        return { ok: false, error: 'Maximum hints reached for this stage.' };
      }

      // 6. Calculate next use & cost
      const nextNum = usesCount + 1;
      const costIdx = Math.min(nextNum - 1, costSchedule.length - 1);
      const cost = costSchedule[costIdx] || 3;
      const durationSec = policyRow.display_seconds != null ? policyRow.display_seconds : (policyRow.kind === 'chart' ? 30 : 0);
      const durationMs = durationSec > 0 ? (durationSec * 1000) : 0;
      const visibleUntil = durationMs > 0 ? (now + durationMs) : 0;

      // 7. Text hint content if applicable
      let contentText = '';
      let hintRow = null;
      if (policyRow.kind === 'text') {
        hintRow = this.db.prepare('SELECT * FROM hint_config WHERE stage = ? AND hintNumber = ? AND enabled = 1').get(stage, nextNum);
        contentText = hintRow ? hintRow.text : '';
      }

      // 8. Insert Usage
      const hintId = hintRow ? hintRow.id : `stage_${stage}_hint_${nextNum}`;
      this.db.prepare(`
        INSERT INTO hint_usage (teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(teamId, stage, hintId, nextNum, cost, now, visibleUntil, idempotencyKey);

      // 9. Update Team Penalty
      const newPenalty = (team.penaltyMin || 0) + cost;
      this.db.prepare('UPDATE teams SET penaltyMin = ?, version = version + 1 WHERE id = ?').run(newPenalty, teamId);

      // 10. Update Progress hintsUsed
      this.db.prepare(`
        INSERT INTO progress (teamId, stage, hintsUsed)
        VALUES (?, ?, ?)
        ON CONFLICT(teamId, stage) DO UPDATE SET hintsUsed = ?
      `).run(teamId, stage, nextNum, nextNum);

      // 11. Calculate next cost
      const nextCostIdx = Math.min(nextNum, costSchedule.length - 1);
      const nextCost = costSchedule[nextCostIdx] || 5;

      return {
        ok: true,
        success: true,
        kind: policyRow.kind,
        content: contentText,
        visibleUntil,
        serverNow: now,
        costMinutes: cost,
        useNumber: nextNum,
        usesTotal: nextNum,
        nextCostMinutes: nextCost,
        newPenaltyMinutes: newPenalty
      };
    });

    return tx();
  }

  async recordHintUsage({ teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey = null }) {
    const res = this.db.prepare(`
      INSERT INTO hint_usage (teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey);
    return res.lastInsertRowid;
  }

  async applyHintUnlock({ teamId, stage, newHintsUsed, newPenalty, hintId, cost, shownAt, visibleUntil, idempotencyKey = null }) {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE progress SET hintsUsed = ? WHERE teamId = ? AND stage = ?').run(newHintsUsed, teamId, stage);
      this.db.prepare('UPDATE teams SET penaltyMin = ?, version = version + 1 WHERE id = ?').run(newPenalty, teamId);
      this.db.prepare(`
        INSERT INTO hint_usage (teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(teamId, stage, hintId, newHintsUsed, cost, shownAt, visibleUntil, idempotencyKey);
    });
    tx();
    return true;
  }

  // --------------------------------------------------------------------------
  // Leader Recovery
  // --------------------------------------------------------------------------
  async createRecoveryCode(teamId, code, expiresAt) {
    this.db.prepare(`
      INSERT OR REPLACE INTO leader_recovery (teamId, code, expiresAt, used)
      VALUES (?, ?, ?, 0)
    `).run(teamId, code, expiresAt);
    return true;
  }

  async getRecoveryCode(teamId, code) {
    return this.db.prepare('SELECT * FROM leader_recovery WHERE teamId = ? AND code = ? AND used = 0 AND expiresAt > ?').get(teamId, code, Date.now()) || null;
  }

  async markRecoveryCodeUsed(teamId, code) {
    this.db.prepare('UPDATE leader_recovery SET used = 1 WHERE teamId = ? AND code = ?').run(teamId, code);
    return true;
  }

  async setLeaderRecovery(teamId, code, expiresAt) {
    return this.createRecoveryCode(teamId, code, expiresAt);
  }

  async getLeaderRecovery(teamId, code) {
    return this.getRecoveryCode(teamId, code);
  }

  async markLeaderRecoveryUsed(teamId, code = null) {
    if (code) {
      return this.markRecoveryCodeUsed(teamId, code);
    }
    this.db.prepare('UPDATE leader_recovery SET used = 1 WHERE teamId = ?').run(teamId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Audit Log
  // --------------------------------------------------------------------------
  async addAuditLog(actor, action, details) {
    this.db.prepare('INSERT INTO audit_log (actor, action, details, at) VALUES (?, ?, ?, ?)').run(actor, action, details, Date.now());
  }

  async getAuditLogs(limit = 200) {
    return this.db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT ?').all(limit) || [];
  }

  // --------------------------------------------------------------------------
  // Stage 2 Workbench & Event State
  // --------------------------------------------------------------------------
  async getStage2Workbench(teamId) {
    const row = this.db.prepare('SELECT payload_loaded, steps, version FROM stage2_workbench WHERE team_id = ?').get(teamId);
    if (!row) {
      return { payloadLoaded: false, steps: [], version: 1 };
    }
    return {
      payloadLoaded: Boolean(row.payload_loaded),
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps || '[]') : (row.steps || []),
      version: row.version || 1
    };
  }

  async saveStage2Workbench(teamId, { payloadLoaded, steps, expectedVersion, action = 'apply', details = null }) {
    const tx = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT version FROM stage2_workbench WHERE team_id = ?').get(teamId);
      const now = Date.now();
      const stepsStr = JSON.stringify(steps || []);
      const pLoaded = payloadLoaded ? 1 : 0;
      let newVersion;

      if (!existing) {
        if (expectedVersion != null && expectedVersion > 1) {
          return { ok: false, conflict: true, currentVersion: 1 };
        }
        newVersion = 2;
        this.db.prepare(`
          INSERT INTO stage2_workbench (team_id, payload_loaded, steps, version, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(teamId, pLoaded, stepsStr, newVersion, now);
      } else {
        if (expectedVersion != null && existing.version !== expectedVersion) {
          return { ok: false, conflict: true, currentVersion: existing.version };
        }
        newVersion = (existing.version || 1) + 1;
        this.db.prepare(`
          UPDATE stage2_workbench
          SET payload_loaded = ?, steps = ?, version = ?, updated_at = ?
          WHERE team_id = ?
        `).run(pLoaded, stepsStr, newVersion, now, teamId);
      }

      this.db.prepare(`
        INSERT INTO stage2_workbench_log (team_id, action, details, version_after, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(teamId, action, typeof details === 'object' ? JSON.stringify(details) : (details || null), newVersion, now);

      return {
        ok: true,
        state: {
          payloadLoaded: Boolean(pLoaded),
          steps: steps || [],
          version: newVersion
        }
      };
    });
    return tx();
  }

  async getEventState() {
    const row = this.db.prepare('SELECT * FROM event_state WHERE id = 1').get();
    if (!row) {
      return { id: 1, startedAt: null, pausedAt: null, totalPausedMs: 0, isPaused: 0, capMinutes: 90, mode: 'self_paced', updatedAt: Date.now() };
    }
    return {
      id: 1,
      startedAt: row.started_at,
      pausedAt: row.paused_at,
      totalPausedMs: row.total_paused_ms || 0,
      isPaused: row.is_paused || 0,
      capMinutes: row.cap_minutes || 90,
      mode: row.mode || 'self_paced',
      updatedAt: row.updated_at
    };
  }

  async updateEventState(updates) {
    const current = await this.getEventState();
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    this.db.prepare(`
      INSERT INTO event_state (id, started_at, paused_at, total_paused_ms, is_paused, cap_minutes, mode, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        started_at = excluded.started_at,
        paused_at = excluded.paused_at,
        total_paused_ms = excluded.total_paused_ms,
        is_paused = excluded.is_paused,
        cap_minutes = excluded.cap_minutes,
        mode = excluded.mode,
        updated_at = excluded.updated_at
    `).run(merged.startedAt, merged.pausedAt, merged.totalPausedMs, merged.isPaused ? 1 : 0, merged.capMinutes, merged.mode, merged.updatedAt);
    return merged;
  }

  async getSchemaVersion() {
    try {
      const row = this.db.prepare('SELECT MAX(version) as maxVer FROM schema_version').get();
      return row ? (row.maxVer || 0) : 0;
    } catch {
      return 0;
    }
  }
}

module.exports = new SQLiteRepository();
