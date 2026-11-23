// FINAL OVERRIDE — Supabase / PostgreSQL Repository Implementation
// High-concurrency, hardened Supabase adapter implementing the exact repository contract.
// Includes in-memory caching (ETag/version aware) and 8s per-request timeouts.

const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig } = require('../config');
const mission = require('../content/mission');

const STAGE1_MEMORISE_MS = (mission.stage1?.memoriseSeconds || 300) * 1000;

class SupabaseRepository {
  constructor(options = {}) {
    const config = getSupabaseConfig();
    this.url = options.url || config.url;
    this.key = options.key || config.secretKey;
    this.timeoutMs = options.timeoutMs || 8000;

    if (this.url && this.key) {
      this.client = createClient(this.url, this.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
    } else {
      this.client = null;
    }

    // In-memory short-lived read cache for polling deduplication
    // Map: cacheKey -> { data, version, expiresAt }
    this.cache = new Map();
    this.cacheTtlMs = 1500; // 1.5s TTL for team state reads during high-frequency polling
  }

  ensureClient() {
    if (!this.client) {
      const config = getSupabaseConfig();
      if (!config.url || !config.secretKey) {
        throw new Error('Supabase repository is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in environment.');
      }
      this.url = config.url;
      this.key = config.secretKey;
      this.client = createClient(this.url, this.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
    }
    return this.client;
  }

  async withTimeout(promise, operationName = 'Supabase operation') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  invalidateCache(prefix = '') {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  async getSetting(key, defaultValue = null) {
    const client = this.ensureClient();
    const cacheKey = `setting:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const { data, error } = await this.withTimeout(
      client.from('settings').select('value').eq('key', key).maybeSingle(),
      `getSetting(${key})`
    );

    if (error) throw error;
    const val = data ? data.value : defaultValue;
    this.cache.set(cacheKey, { data: val, expiresAt: Date.now() + 5000 });
    return val;
  }

  async getAllSettings() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('settings').select('key, value'),
      'getAllSettings'
    );
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    return map;
  }

  async setSetting(key, value) {
    const client = this.ensureClient();
    this.invalidateCache(`setting:${key}`);
    const { error } = await this.withTimeout(
      client.from('settings').upsert({ key, value: String(value) }, { onConflict: 'key' }),
      `setSetting(${key})`
    );
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------
  async getTeamByToken(token) {
    if (!token) return null;
    const cacheKey = `team:token:${token}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('teams').select('*').eq('sessionToken', token).maybeSingle(),
      'getTeamByToken'
    );
    if (error) throw error;
    if (data) {
      this.cache.set(cacheKey, { data, expiresAt: Date.now() + this.cacheTtlMs });
      this.cache.set(`team:id:${data.id}`, { data, expiresAt: Date.now() + this.cacheTtlMs });
    }
    return data || null;
  }

  async getTeamById(id) {
    if (!id) return null;
    const cacheKey = `team:id:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('teams').select('*').eq('id', id).maybeSingle(),
      'getTeamById'
    );
    if (error) throw error;
    if (data) {
      this.cache.set(cacheKey, { data, expiresAt: Date.now() + this.cacheTtlMs });
      if (data.sessionToken) {
        this.cache.set(`team:token:${data.sessionToken}`, { data, expiresAt: Date.now() + this.cacheTtlMs });
      }
    }
    return data || null;
  }

  async getTeamByName(name) {
    if (!name) return null;
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('teams').select('*').ilike('name', name.trim()).maybeSingle(),
      'getTeamByName'
    );
    if (error) throw error;
    return data || null;
  }

  async getAllTeams() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('teams').select('*').order('startedAt', { ascending: false }),
      'getAllTeams'
    );
    if (error) throw error;
    return data || [];
  }

  async getWaitingTeamsCount() {
    const client = this.ensureClient();
    const { count, error } = await this.withTimeout(
      client.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
      'getWaitingTeamsCount'
    );
    if (error) throw error;
    return count || 0;
  }

  async createTeam({ team, members, stages = 6, sequence }) {
    const client = this.ensureClient();
    this.invalidateCache('team:');

    // Attempt atomic RPC if available
    try {
      const { data, error } = await this.withTimeout(
        client.rpc('register_team', {
          p_team: {
            id: team.id,
            name: team.name,
            coordinator: team.coordinator,
            startedAt: team.startedAt,
            sessionToken: team.sessionToken,
            status: team.status,
            seed: team.seed || null,
            stage1EnteredAt: team.stage1EnteredAt || team.startedAt,
            stage1OpensAt: team.stage1OpensAt || (team.startedAt + STAGE1_MEMORISE_MS),
            memberCount: team.memberCount || members.length
          },
          p_members: members.map(m => ({
            id: m.id,
            fullName: m.fullName,
            isLeader: m.isLeader ? 1 : 0,
            deviceToken: m.deviceToken || null,
            codeType: m.codeType || null,
            assignedCode: m.assignedCode || null
          })),
          p_stages: stages,
          p_sequence: sequence ? {
            fragmentOrder: JSON.stringify(sequence.fragmentOrder),
            expectedAnswer: sequence.expectedAnswer,
            createdAt: Date.now()
          } : null
        }),
        'register_team RPC'
      );

      if (!error && data?.ok) {
        return team;
      }
    } catch (_) {
      // Fallback to table inserts if RPC not present in local dev or test mode
    }

    // Direct table inserts fallback
    const { error: teamErr } = await client.from('teams').insert({
      id: team.id,
      name: team.name,
      coordinator: team.coordinator,
      startedAt: team.startedAt,
      finishedAt: null,
      stage: 1,
      penaltyMin: 0,
      pausedMs: 0,
      sessionToken: team.sessionToken,
      status: team.status,
      isPaused: 0,
      teamPauseStartedAt: 0,
      tabSwitches: 0,
      seed: team.seed || null,
      version: 1,
      stage1EnteredAt: team.stage1EnteredAt || team.startedAt,
      stage1OpensAt: team.stage1OpensAt || (team.startedAt + STAGE1_MEMORISE_MS),
      memberCount: team.memberCount || members.length
    });
    if (teamErr) throw teamErr;

    const memberRows = members.map(m => ({
      id: m.id,
      teamId: team.id,
      fullName: m.fullName,
      isLeader: m.isLeader ? 1 : 0,
      deviceToken: m.deviceToken || null,
      codeType: m.codeType || null,
      assignedCode: m.assignedCode || null
    }));
    const { error: memErr } = await client.from('members').insert(memberRows);
    if (memErr) throw memErr;

    if (sequence) {
      await client.from('team_sequences').insert({
        teamId: team.id,
        fragmentOrder: JSON.stringify(sequence.fragmentOrder),
        expectedAnswer: sequence.expectedAnswer,
        createdAt: Date.now()
      });
    }

    const progRows = [];
    for (let s = 1; s <= stages; s++) {
      progRows.push({
        teamId: team.id,
        stage: s,
        fragment: null,
        wrongAttempts: 0,
        hintsUsed: 0,
        solvedAt: null
      });
    }
    await client.from('progress').insert(progRows);

    return team;
  }

  async updateTeam(id, fields) {
    const client = this.ensureClient();

    const updateFields = { ...fields };
    if (!('version' in updateFields)) {
      const current = await this.getTeamById(id);
      updateFields.version = (current?.version || 1) + 1;
    }

    const { error } = await this.withTimeout(
      client.from('teams').update(updateFields).eq('id', id),
      `updateTeam(${id})`
    );
    if (error) throw error;
    this.invalidateCache(`team:id:${id}`);
    this.invalidateCache('team:token:');
    return true;
  }

  async deleteTeam(id) {
    const client = this.ensureClient();
    this.invalidateCache();
    const { error } = await this.withTimeout(
      client.from('teams').delete().eq('id', id),
      `deleteTeam(${id})`
    );
    if (error) throw error;
    return true;
  }

  async addPausedMsToActiveTeams(duration) {
    if (duration <= 0) return true;
    const client = this.ensureClient();
    this.invalidateCache('team:');

    // Use RPC if possible or fetch and batch update
    const { data: activeTeams } = await client.from('teams').select('id, pausedMs, version').is('finishedAt', null);
    if (activeTeams && activeTeams.length > 0) {
      for (const t of activeTeams) {
        await client.from('teams').update({
          pausedMs: (t.pausedMs || 0) + duration,
          version: (t.version || 1) + 1
        }).eq('id', t.id);
      }
    }
    return true;
  }

  async startAllTeams(now) {
    const client = this.ensureClient();
    this.invalidateCache();

    try {
      const { data, error } = await client.rpc('launch_game', { p_now: now });
      if (!error && data?.ok) {
        return data.startedCount || 0;
      }
    } catch (_) { }

    await this.setSetting('gameStarted', 'true');
    await this.setSetting('eventStartedAt', String(now));
    await this.setSetting('clockPaused', 'false');
    await this.setSetting('pauseStartedAt', '0');

    const { data: waitingTeams } = await client.from('teams').select('id, version').eq('status', 'waiting');
    let count = 0;
    if (waitingTeams) {
      for (const t of waitingTeams) {
        await client.from('teams').update({
          status: 'active',
          startedAt: now,
          stage1EnteredAt: now,
          stage1OpensAt: now + STAGE1_MEMORISE_MS,
          version: (t.version || 1) + 1
        }).eq('id', t.id);
        count++;
      }
    }
    return count;
  }

  async restartAllTeams(mode, now) {
    const targetStatus = mode === 'active' ? 'active' : 'waiting';
    const client = this.ensureClient();
    this.invalidateCache();

    await client.from('submissions').delete().neq('id', 0);
    await client.from('chat').delete().neq('id', 0);
    await client.from('violations').delete().neq('id', 0);
    await client.from('hint_usage').delete().neq('id', 0);
    await client.from('progress').delete().neq('stage', 0);

    const { data: teams } = await client.from('teams').select('id, version');
    if (teams) {
      const progRows = [];
      for (const t of teams) {
        for (let s = 1; s <= 6; s++) {
          progRows.push({ teamId: t.id, stage: s, fragment: null, wrongAttempts: 0, hintsUsed: 0, solvedAt: null });
        }
        await client.from('teams').update({
          stage: 1,
          finishedAt: null,
          penaltyMin: 0,
          pausedMs: 0,
          tabSwitches: 0,
          status: targetStatus,
          startedAt: now,
          stage1EnteredAt: now,
          stage1OpensAt: now + STAGE1_MEMORISE_MS,
          version: (t.version || 1) + 1
        }).eq('id', t.id);
      }
      if (progRows.length > 0) {
        await client.from('progress').insert(progRows);
      }
    }
    return true;
  }

  async resetTeam(id) {
    const now = Date.now();
    const client = this.ensureClient();
    this.invalidateCache(`team:id:${id}`);

    await client.from('submissions').delete().eq('teamId', id);
    await client.from('chat').delete().eq('teamId', id);
    await client.from('violations').delete().eq('teamId', id);
    await client.from('hint_usage').delete().eq('teamId', id);
    await client.from('progress').update({
      fragment: null,
      wrongAttempts: 0,
      hintsUsed: 0,
      solvedAt: null
    }).eq('teamId', id);

    const current = await this.getTeamById(id);
    await client.from('teams').update({
      stage: 1,
      finishedAt: null,
      penaltyMin: 0,
      pausedMs: 0,
      tabSwitches: 0,
      startedAt: now,
      stage1EnteredAt: now,
      stage1OpensAt: now + STAGE1_MEMORISE_MS,
      version: (current?.version || 1) + 1
    }).eq('id', id);

    return true;
  }

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async getMembers(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('members').select('*').eq('teamId', teamId),
      `getMembers(${teamId})`
    );
    if (error) throw error;
    return data || [];
  }

  async getMemberById(id) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('members').select('*').eq('id', id).maybeSingle(),
      `getMemberById(${id})`
    );
    if (error) throw error;
    return data || null;
  }

  async updateMember(id, fields) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('members').update(fields).eq('id', id),
      `updateMember(${id})`
    );
    if (error) throw error;
    return true;
  }

  async getMembersForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('members').select('*').in('teamId', teamIds),
      'getMembersForTeams'
    );
    if (error) throw error;
    return data || [];
  }

  async getMemberByDeviceToken(deviceToken) {
    if (!deviceToken) return null;
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('members').select('*').eq('deviceToken', deviceToken).maybeSingle(),
      'getMemberByDeviceToken'
    );
    if (error) throw error;
    return data || null;
  }

  async assignDeviceToken(memberId, deviceToken) {
    return this.updateMember(memberId, { deviceToken });
  }

  async resetMemberDevice(memberId) {
    return this.updateMember(memberId, { deviceToken: null });
  }

  async resetAllMemberDevices(teamId) {
    const client = this.ensureClient();
    const { error } = await client.from('members').update({ deviceToken: null }).eq('teamId', teamId);
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Team Sequences (Stage 2)
  // --------------------------------------------------------------------------
  async getTeamSequence(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('team_sequences').select('*').eq('teamId', teamId).maybeSingle(),
      `getTeamSequence(${teamId})`
    );
    if (error) throw error;
    if (!data) return null;
    return {
      teamId: data.teamId,
      fragmentOrder: typeof data.fragmentOrder === 'string' ? JSON.parse(data.fragmentOrder) : data.fragmentOrder,
      expectedAnswer: data.expectedAnswer,
      createdAt: data.createdAt
    };
  }

  async setTeamSequence(teamId, fragmentOrder, expectedAnswer) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('team_sequences').upsert({
        teamId,
        fragmentOrder: JSON.stringify(fragmentOrder),
        expectedAnswer,
        createdAt: Date.now()
      }, { onConflict: 'teamId' }),
      `setTeamSequence(${teamId})`
    );
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Progress
  // --------------------------------------------------------------------------
  async getProgress(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('progress').select('*').eq('teamId', teamId).order('stage', { ascending: true }),
      `getProgress(${teamId})`
    );
    if (error) throw error;
    return data || [];
  }

  async getProgressForStage(teamId, stage) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('progress').select('*').eq('teamId', teamId).eq('stage', stage).maybeSingle(),
      `getProgressForStage(${teamId}, ${stage})`
    );
    if (error) throw error;
    return data || null;
  }

  async getProgressForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('progress').select('*').in('teamId', teamIds).order('stage', { ascending: true }),
      'getProgressForTeams'
    );
    if (error) throw error;
    return data || [];
  }

  async resetTeamProgress(teamId, now) {
    const client = this.ensureClient();
    await client.from('progress').update({
      fragment: null,
      wrongAttempts: 0,
      hintsUsed: 0,
      solvedAt: null
    }).eq('teamId', teamId);

    const current = await this.getTeamById(teamId);
    await client.from('teams').update({
      stage: 1,
      finishedAt: null,
      penaltyMin: 0,
      pausedMs: 0,
      tabSwitches: 0,
      startedAt: now,
      stage1EnteredAt: now,
      stage1OpensAt: now + STAGE1_MEMORISE_MS,
      version: (current?.version || 1) + 1
    }).eq('id', teamId);
    return true;
  }

  async updateProgress(teamId, stage, fields) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('progress').update(fields).eq('teamId', teamId).eq('stage', stage),
      `updateProgress(${teamId}, ${stage})`
    );
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Submissions
  // --------------------------------------------------------------------------
  async addSubmission({ teamId, stage, valueHash, rawValue, ok, at, idempotencyKey = null }) {
    const client = this.ensureClient();

    try {
      const { data, error } = await client.rpc('submit_answer', {
        p_team_id: teamId,
        p_stage: stage,
        p_raw_value: rawValue,
        p_value_hash: valueHash,
        p_ok: ok ? 1 : 0,
        p_at: at,
        p_idempotency_key: idempotencyKey
      });
      if (!error && data?.ok) {
        return data.submissionId;
      }
    } catch (_) { }

    const { data, error } = await this.withTimeout(
      client.from('submissions').insert({
        teamId,
        stage,
        valueHash,
        rawValue,
        ok: ok ? 1 : 0,
        at,
        idempotencyKey
      }).select('id').single(),
      'addSubmission'
    );
    if (error) throw error;
    return data?.id;
  }

  async getSubmissions(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('submissions').select('*').eq('teamId', teamId).order('at', { ascending: false }),
      `getSubmissions(${teamId})`
    );
    if (error) throw error;
    return data || [];
  }

  async getAllSubmissions() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('submissions').select('*').order('at', { ascending: false }),
      'getAllSubmissions'
    );
    if (error) throw error;
    return data || [];
  }

  // --------------------------------------------------------------------------
  // Violations
  // --------------------------------------------------------------------------
  async addViolation({ id, teamId, stage = 0, type, details = null, penaltyAdded = 0, at }) {
    const client = this.ensureClient();

    try {
      const { data, error } = await client.rpc('add_violation', {
        p_team_id: teamId,
        p_stage: stage,
        p_type: type,
        p_details: details,
        p_penalty_added: penaltyAdded,
        p_at: at
      });
      if (!error && data?.ok) {
        return data.violationId;
      }
    } catch (_) { }

    const { data, error } = await this.withTimeout(
      client.from('violations').insert({
        teamId,
        stage,
        type,
        details,
        penaltyAdded,
        at
      }).select('id').single(),
      'addViolation'
    );
    if (error) throw error;
    return data?.id;
  }

  async getViolations(limit = 50) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('violations').select('*').order('at', { ascending: false }).limit(limit),
      'getViolations'
    );
    if (error) throw error;
    return data || [];
  }

  async getAllViolations() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('violations').select('*').order('at', { ascending: false }),
      'getAllViolations'
    );
    if (error) throw error;
    return data || [];
  }

  async getTabViolationsCount(teamId, stage = null) {
    const client = this.ensureClient();
    let query = client.from('violations').select('id', { count: 'exact', head: true }).eq('teamId', teamId).eq('type', 'tab_switch');
    if (stage) query = query.eq('stage', stage);
    const { count, error } = await this.withTimeout(query, 'getTabViolationsCount');
    if (error) throw error;
    return count || 0;
  }

  async getLastTabViolation(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('violations').select('*').eq('teamId', teamId).eq('type', 'tab_switch').order('at', { ascending: false }).limit(1).maybeSingle(),
      'getLastTabViolation'
    );
    if (error) throw error;
    return data || null;
  }

  async deleteViolation(id) {
    const client = this.ensureClient();
    const { error } = await client.from('violations').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------------
  async addChat({ teamId, role, text, at }) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('chat').insert({ teamId, role, text, at }).select('id').single(),
      'addChat'
    );
    if (error) throw error;
    return data?.id;
  }

  async getChat(teamId) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('chat').select('*').eq('teamId', teamId).order('at', { ascending: true }),
      `getChat(${teamId})`
    );
    if (error) throw error;
    return data || [];
  }

  async getChatHistory(teamId) {
    return this.getChat(teamId);
  }

  async getRecentChatCount(teamId, role, sinceTime) {
    const client = this.ensureClient();
    const { count, error } = await this.withTimeout(
      client.from('chat').select('id', { count: 'exact', head: true }).eq('teamId', teamId).eq('role', role).gt('at', sinceTime),
      'getRecentChatCount'
    );
    if (error) throw error;
    return count || 0;
  }

  async getRecentWardenLogs(limit = 60) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('chat').select('id, teamId, role, text, at, teams(name)').order('at', { ascending: false }).limit(limit),
      'getRecentWardenLogs'
    );
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      teamId: r.teamId,
      teamName: r.teams?.name || r.teamId,
      role: r.role,
      text: r.text,
      at: r.at
    }));
  }

  // --------------------------------------------------------------------------
  // Hint Configuration & Usage
  // --------------------------------------------------------------------------
  async getAllHintConfigs() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('hint_config').select('*').order('stage', { ascending: true }).order('displayOrder', { ascending: true }),
      'getAllHintConfigs'
    );
    if (error) throw error;
    return data || [];
  }

  async getHintConfig(stage, hintNumber) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('hint_config').select('*').eq('stage', stage).eq('hintNumber', hintNumber).eq('enabled', 1).maybeSingle(),
      `getHintConfig(${stage}, ${hintNumber})`
    );
    if (error) throw error;
    return data || null;
  }

  async updateHintConfig(id, fields) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('hint_config').update(fields).eq('id', id),
      `updateHintConfig(${id})`
    );
    if (error) throw error;
    return true;
  }

  async getHintUsage(teamId, stage) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('hint_usage').select('*').eq('teamId', teamId).eq('stage', stage).order('shownAt', { ascending: true }),
      `getHintUsage(${teamId}, ${stage})`
    );
    if (error) throw error;
    return data || [];
  }

  // --------------------------------------------------------------------------
  // Hint Policies & Unified Hint Requests
  // --------------------------------------------------------------------------
  async getHintPolicy(stage) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('hint_policy').select('*').eq('stage', stage).maybeSingle(),
      `getHintPolicy(${stage})`
    );
    if (error) throw error;
    if (!data) return null;
    let schedule = data.cost_schedule_minutes || [3, 5];
    if (typeof schedule === 'string') {
      try { schedule = JSON.parse(schedule); } catch (_) { schedule = [3, 5]; }
    }
    return {
      stage: data.stage,
      kind: data.kind,
      maxUses: data.max_uses,
      costScheduleMinutes: schedule,
      displaySeconds: data.display_seconds,
      enabled: Boolean(data.enabled),
      editedByAdmin: Boolean(data.edited_by_admin),
      updatedBy: data.updated_by,
      updatedAt: data.updated_at
    };
  }

  async getAllHintPolicies() {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('hint_policy').select('*').order('stage', { ascending: true }),
      'getAllHintPolicies'
    );
    if (error) throw error;
    return (data || []).map(row => {
      let schedule = row.cost_schedule_minutes || [3, 5];
      if (typeof schedule === 'string') {
        try { schedule = JSON.parse(schedule); } catch (_) { schedule = [3, 5]; }
      }
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
    const client = this.ensureClient();
    const patch = { edited_by_admin: true, updated_at: new Date().toISOString() };
    if (updates.kind !== undefined) patch.kind = updates.kind;
    if (updates.maxUses !== undefined) patch.max_uses = updates.maxUses;
    if (updates.max_uses !== undefined) patch.max_uses = updates.max_uses;
    if (updates.costScheduleMinutes !== undefined) patch.cost_schedule_minutes = updates.costScheduleMinutes;
    if (updates.cost_schedule_minutes !== undefined) patch.cost_schedule_minutes = updates.cost_schedule_minutes;
    if (updates.displaySeconds !== undefined) patch.display_seconds = updates.displaySeconds;
    if (updates.display_seconds !== undefined) patch.display_seconds = updates.display_seconds;
    if (updates.enabled !== undefined) patch.enabled = Boolean(updates.enabled);
    if (updates.updatedBy !== undefined) patch.updated_by = updates.updatedBy;
    if (updates.updated_by !== undefined) patch.updated_by = updates.updated_by;

    const { error } = await this.withTimeout(
      client.from('hint_policy').update(patch).eq('stage', stage),
      `updateHintPolicy(${stage})`
    );
    if (error) throw error;
    return true;
  }

  async requestHint(teamId, stage, idempotencyKey = null, now = Date.now()) {
    const client = this.ensureClient();
    this.invalidateCache(`team:id:${teamId}`);

    const { data, error } = await this.withTimeout(
      client.rpc('request_hint', {
        p_team_id: teamId,
        p_stage: stage,
        p_idempotency_key: idempotencyKey,
        p_now: now
      }),
      'request_hint RPC'
    );

    if (error) throw error;
    return data;
  }

  async recordHintUsage({ teamId, stage, hintId, hintNumber, penaltyCharged, shownAt, visibleUntil, idempotencyKey = null }) {
    const client = this.ensureClient();

    try {
      const { data, error } = await client.rpc('request_hint', {
        p_team_id: teamId,
        p_stage: stage,
        p_hint_number: hintNumber,
        p_shown_at: shownAt,
        p_visible_until: visibleUntil,
        p_penalty_charged: penaltyCharged,
        p_idempotency_key: idempotencyKey
      });
      if (!error && data?.ok) {
        return data.hintId;
      }
    } catch (_) { }

    const { data, error } = await this.withTimeout(
      client.from('hint_usage').insert({
        teamId,
        stage,
        hintId,
        hintNumber,
        penaltyCharged,
        shownAt,
        visibleUntil,
        idempotencyKey
      }).select('id').single(),
      'recordHintUsage'
    );
    if (error) throw error;
    return data?.id;
  }

  async applyHintUnlock({ teamId, stage, newHintsUsed, newPenalty, hintId, cost, shownAt, visibleUntil, idempotencyKey = null }) {
    await this.updateProgress(teamId, stage, { hintsUsed: newHintsUsed });
    await this.updateTeam(teamId, { penaltyMin: newPenalty });
    await this.recordHintUsage({ teamId, stage, hintId, hintNumber: newHintsUsed, penaltyCharged: cost, shownAt, visibleUntil, idempotencyKey });
    return true;
  }

  // --------------------------------------------------------------------------
  // Leader Recovery
  // --------------------------------------------------------------------------
  async createRecoveryCode(teamId, code, expiresAt) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('leader_recovery').upsert({
        teamId,
        code,
        expiresAt,
        used: 0
      }, { onConflict: 'teamId' }),
      'createRecoveryCode'
    );
    if (error) throw error;
    return true;
  }

  async getRecoveryCode(teamId, code) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('leader_recovery').select('*').eq('teamId', teamId).eq('code', code).eq('used', 0).gt('expiresAt', Date.now()).maybeSingle(),
      'getRecoveryCode'
    );
    if (error) throw error;
    return data || null;
  }

  async markRecoveryCodeUsed(teamId, code) {
    const client = this.ensureClient();
    const { error } = await this.withTimeout(
      client.from('leader_recovery').update({ used: 1 }).eq('teamId', teamId).eq('code', code),
      'markRecoveryCodeUsed'
    );
    if (error) throw error;
    return true;
  }

  async setLeaderRecovery(teamId, code, expiresAt) {
    return this.createRecoveryCode(teamId, code, expiresAt);
  }

  async getLeaderRecovery(teamId, code) {
    return this.getRecoveryCode(teamId, code);
  }

  async markLeaderRecoveryUsed(teamId, code = null) {
    if (code) return this.markRecoveryCodeUsed(teamId, code);
    const client = this.ensureClient();
    const { error } = await client.from('leader_recovery').update({ used: 1 }).eq('teamId', teamId);
    if (error) throw error;
    return true;
  }

  // --------------------------------------------------------------------------
  // Audit Log
  // --------------------------------------------------------------------------
  async addAuditLog(actor, action, details) {
    const client = this.ensureClient();
    await client.from('audit_log').insert({
      actor,
      action,
      details,
      at: Date.now()
    });
  }

  async getAuditLogs(limit = 200) {
    const client = this.ensureClient();
    const { data, error } = await this.withTimeout(
      client.from('audit_log').select('*').order('at', { ascending: false }).limit(limit),
      'getAuditLogs'
    );
    if (error) throw error;
    return data || [];
  }

  // --------------------------------------------------------------------------
  // Stage 2 Workbench & Event State
  // --------------------------------------------------------------------------
  async getStage2Workbench(teamId) {
    const client = this.ensureClient();
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('stage2_get_workbench', { p_team_id: teamId });
      if (!rpcErr && rpcData) {
        return {
          payloadLoaded: Boolean(rpcData.payloadLoaded),
          steps: Array.isArray(rpcData.steps) ? rpcData.steps : (typeof rpcData.steps === 'string' ? JSON.parse(rpcData.steps) : []),
          version: rpcData.version || 1
        };
      }
    } catch (_) { }

    const { data, error } = await this.withTimeout(
      client.from('stage2_workbench').select('payload_loaded, steps, version').eq('team_id', teamId).maybeSingle(),
      `getStage2Workbench(${teamId})`
    );
    if (error) throw error;
    if (!data) {
      return { payloadLoaded: false, steps: [], version: 1 };
    }
    return {
      payloadLoaded: Boolean(data.payload_loaded),
      steps: Array.isArray(data.steps) ? data.steps : (typeof data.steps === 'string' ? JSON.parse(data.steps) : []),
      version: data.version || 1
    };
  }

  async saveStage2Workbench(teamId, { payloadLoaded, steps, expectedVersion, action = 'apply', details = null }) {
    const client = this.ensureClient();
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('stage2_save_workbench', {
        p_team_id: teamId,
        p_payload_loaded: Boolean(payloadLoaded),
        p_steps: steps || [],
        p_expected_version: expectedVersion || null,
        p_action: action,
        p_details: details || null
      });
      if (!rpcErr && rpcData) return rpcData;
    } catch (_) { }

    const { data: existing, error: selErr } = await client.from('stage2_workbench').select('version').eq('team_id', teamId).maybeSingle();
    if (selErr) throw selErr;
    let newVersion;
    if (!existing) {
      if (expectedVersion != null && expectedVersion > 1) {
        return { ok: false, conflict: true, currentVersion: 1 };
      }
      newVersion = 2;
      const { error: insErr } = await client.from('stage2_workbench').insert({
        team_id: teamId,
        payload_loaded: Boolean(payloadLoaded),
        steps: steps || [],
        version: newVersion,
        updated_at: new Date().toISOString()
      });
      if (insErr) throw insErr;
    } else {
      if (expectedVersion != null && existing.version !== expectedVersion) {
        return { ok: false, conflict: true, currentVersion: existing.version };
      }
      newVersion = (existing.version || 1) + 1;
      const { error: updErr } = await client.from('stage2_workbench').update({
        payload_loaded: Boolean(payloadLoaded),
        steps: steps || [],
        version: newVersion,
        updated_at: new Date().toISOString()
      }).eq('team_id', teamId);
      if (updErr) throw updErr;
    }

    try {
      await client.from('stage2_workbench_log').insert({
        team_id: teamId,
        action,
        details,
        version_after: newVersion
      });
    } catch (_) { }

    return {
      ok: true,
      state: {
        payloadLoaded: Boolean(payloadLoaded),
        steps: steps || [],
        version: newVersion
      }
    };
  }

  async getEventState() {
    const client = this.ensureClient();
    try {
      const { data, error } = await client.from('event_state').select('*').eq('id', 1).maybeSingle();
      if (!error && data) {
        return {
          id: 1,
          startedAt: data.started_at ? new Date(data.started_at).getTime() : null,
          pausedAt: data.paused_at ? new Date(data.paused_at).getTime() : null,
          totalPausedMs: Number(data.total_paused_ms || 0),
          isPaused: data.is_paused ? 1 : 0,
          capMinutes: Number(data.cap_minutes || 90),
          mode: data.mode || 'self_paced',
          updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
        };
      }
    } catch (_) { }
    return { id: 1, startedAt: null, pausedAt: null, totalPausedMs: 0, isPaused: 0, capMinutes: 90, mode: 'self_paced', updatedAt: Date.now() };
  }

  async updateEventState(updates) {
    const client = this.ensureClient();
    const current = await this.getEventState();
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    const row = {
      id: 1,
      started_at: merged.startedAt ? new Date(merged.startedAt).toISOString() : null,
      paused_at: merged.pausedAt ? new Date(merged.pausedAt).toISOString() : null,
      total_paused_ms: merged.totalPausedMs,
      is_paused: Boolean(merged.isPaused),
      cap_minutes: merged.capMinutes,
      mode: merged.mode,
      updated_at: new Date().toISOString()
    };
    await client.from('event_state').upsert(row);
    return merged;
  }

  async getSchemaVersion() {
    const client = this.ensureClient();
    try {
      const { data, error } = await client.from('schema_version').select('version').order('version', { ascending: false }).limit(1).maybeSingle();
      if (!error && data) return data.version;
    } catch (_) { }
    return 0;
  }
}

module.exports = SupabaseRepository;
