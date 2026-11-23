// ==============================================================================
// FINAL OVERRIDE — Master Organiser Portal View Controller
// Zero emoji, zero inline event handlers, strict design system compliance.
// In-place DOM row updates, live ticking event clock.
// ==============================================================================

import { esc } from './lobby.js';

let adminPollInterval = null;
let adminClockTickInterval = null;
let currentEventState = null;
let clientClockOffset = 0;

export async function renderAdminView(container, controller) {
  if (adminPollInterval) clearInterval(adminPollInterval);
  if (adminClockTickInterval) clearInterval(adminClockTickInterval);
  adminPollInterval = null;
  adminClockTickInterval = null;

  let adminPin = sessionStorage.getItem('fo_admin_pin') || '';

  if (!adminPin) {
    container.innerHTML = `
      <div id="admin-login-card" class="card page-enter" style="max-width: 440px; margin: 40px auto; padding: 24px;">
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Command Access</div>
        <h2 style="color: var(--accent-primary); margin: 0 0 16px;">Master Organiser Portal</h2>
        <form id="admin-login-form">
          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: block; font-size: 0.82rem; text-transform: uppercase; margin-bottom: 6px;">Master Organiser PIN</label>
            <input type="password" id="admin-pin-input" class="input-control" placeholder="Enter PIN..." required autocomplete="current-password" autofocus />
          </div>
          <button type="submit" id="btn-admin-login" class="btn btn-primary" style="width: 100%;">Authenticate</button>
        </form>
        <div id="admin-login-error" class="alert alert-danger" style="display: none; margin-top: 14px;"></div>
      </div>
    `;

    const form = document.getElementById('admin-login-form');
    const pinInput = document.getElementById('admin-pin-input');
    const errBox = document.getElementById('admin-login-error');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = pinInput.value.trim();
      if (!pin) return;

      errBox.style.display = 'none';
      try {
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('fo_admin_pin', pin);
          renderAdminView(container, controller);
        } else {
          errBox.textContent = data.error || 'Authentication rejected.';
          errBox.style.display = 'block';
        }
      } catch {
        errBox.textContent = 'Server connection error.';
        errBox.style.display = 'block';
      }
    });

    return;
  }

  // ── Logged in admin view ─────────────────────────────────────────────────────

  async function loadData() {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (res.status === 401) {
        sessionStorage.removeItem('fo_admin_pin');
        renderAdminView(container, controller);
        return;
      }
      if (!res.ok) {
        console.error('Admin overview returned status:', res.status);
        return;
      }
      const data = await res.json();
      updateDashboard(data);
    } catch (err) {
      console.error('Admin fetch error:', err);
    }
  }

  async function loadHintsData() {
    try {
      const res = await fetch('/api/admin/hints', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (!res.ok) return;
      const data = await res.json();
      renderHintsTable(data.hints || [], data.policies || []);
    } catch (err) {
      console.error('Admin hints load error:', err);
    }
  }

  function renderHintsTable(hints, policies = []) {
    const tbody = document.getElementById('admin-hints-tbody');
    if (!tbody) return;

    const stage1Policy = policies.find(p => p.stage === 1) || {
      stage: 1,
      kind: 'chart',
      costScheduleMinutes: [3, 5],
      displaySeconds: 30,
      enabled: true
    };

    const stage1Row = `
      <tr data-hint-id="stage_1_policy" data-stage="1">
        <td style="font-weight: bold; color: var(--accent-primary);">stage_1_policy</td>
        <td>Stage 1 (Morse Chart)</td>
        <td style="font-size: 0.85rem; color: var(--text-secondary);">Signal Intercept</td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">
            Morse chart, repeatable (No text field)
          </div>
        </td>
        <td>
          <input type="number" class="input-control hint-duration-input tabular-nums" value="${stage1Policy.displaySeconds || 30}" min="5" max="300" style="width: 70px;" />
        </td>
        <td>
          <input type="text" class="input-control hint-schedule-input tabular-nums" value="${(stage1Policy.costScheduleMinutes || [3, 5]).join(',')}" style="width: 70px;" placeholder="3,5" />
        </td>
        <td style="text-align: center;">
          <input type="checkbox" class="hint-enabled-toggle" ${stage1Policy.enabled ? 'checked' : ''} />
        </td>
        <td>
          <button class="btn btn-sm btn-outline btn-save-hint" data-id="stage_1_policy" data-stage="1">Save</button>
        </td>
      </tr>
    `;

    const otherRows = hints.filter(h => h.stage >= 2).map(h => `
      <tr data-hint-id="${esc(h.id)}" data-stage="${h.stage}">
        <td style="font-weight: bold; color: var(--accent-primary);">${esc(h.id)}</td>
        <td>Stage ${h.stage} (#${h.hintNumber})</td>
        <td style="font-size: 0.85rem; color: var(--text-secondary);">${esc(h.moduleName)}</td>
        <td>
          <textarea class="input-control hint-text-input" rows="2" style="font-size: 0.85rem; width: 100%; min-width: 220px;">${esc(h.text)}</textarea>
        </td>
        <td>
          <input type="number" class="input-control hint-duration-input tabular-nums" value="${h.displayDurationSeconds}" min="0" max="300" style="width: 70px;" />
        </td>
        <td>
          <input type="number" class="input-control hint-penalty-input tabular-nums" value="${h.penaltyMinutes}" min="0" max="30" style="width: 70px;" />
        </td>
        <td style="text-align: center;">
          <input type="checkbox" class="hint-enabled-toggle" ${h.enabled ? 'checked' : ''} />
        </td>
        <td>
          <button class="btn btn-sm btn-outline btn-save-hint" data-id="${esc(h.id)}" data-stage="${h.stage}">Save</button>
        </td>
      </tr>
    `).join('');

    tbody.innerHTML = stage1Row + otherRows;
  }

  function initAdminShell() {
    container.innerHTML = `
      <div id="admin-dashboard-view" class="admin-dashboard-container page-enter">
        <!-- Header Bar -->
        <div class="admin-header-bar">
          <div class="admin-header-title">
            <div class="admin-header-subtitle">Tactical Control Center</div>
            <h2>Master Organiser Portal</h2>
          </div>
          <div class="admin-header-actions">
            <button id="btn-admin-refresh" class="btn btn-sm btn-outline">Refresh</button>
            <button id="btn-toggle-hints" class="btn btn-sm btn-outline" style="border-color: var(--accent-warning); color: var(--accent-warning);">Hint Policies</button>
            <a href="/api/admin/export.csv?pin=${encodeURIComponent(adminPin)}" target="_blank" class="btn btn-sm btn-outline" style="color: var(--accent-primary);">Export CSV</a>
            <a href="/api/admin/export.json?pin=${encodeURIComponent(adminPin)}" target="_blank" class="btn btn-sm btn-outline" style="color: var(--accent-primary);">Export JSON</a>
            <button id="btn-admin-freeze" class="btn btn-sm btn-outline" style="border-color: var(--accent-warning); color: var(--accent-warning);">Freeze Board</button>
            <button id="btn-admin-logout" class="btn btn-sm btn-outline btn-danger-outline">Logout</button>
          </div>
        </div>

        <!-- Master Metrics & Clock Grid -->
        <div class="admin-metrics-grid">
          <!-- Event Clock Card -->
          <div class="admin-card">
            <div class="admin-card-header">
              <span>Event Master Clock</span>
              <span id="admin-clock-badge" class="admin-clock-status-badge waiting">WAITING</span>
            </div>
            <div id="admin-clock-value" class="admin-clock-value"><span id="admin-live-clock">00:00:00</span></div>
            <div class="admin-clock-meta">
              <span id="admin-clock-cap-remaining">Cap: 90m remaining</span>
              <span id="admin-clock-mode-label">Mode: Self-paced</span>
            </div>
            <div class="admin-card-actions">
              <button id="btn-clock-toggle" class="btn btn-sm btn-primary">Pause Clock</button>
              <button id="btn-clock-launch" class="btn btn-sm btn-warning">Launch All Teams</button>
            </div>
          </div>

          <!-- Active Teams Overview Card -->
          <div class="admin-card">
            <div class="admin-card-header">
              <span>Roster Summary</span>
              <span id="admin-db-provider-badge" class="badge badge-outline">PROVIDER: --</span>
            </div>
            <div id="admin-team-count" class="admin-clock-value" style="font-size: 1.8rem;"><span id="stat-total-teams">0</span> Teams</div>
            <div id="admin-counts-breakdown" class="admin-clock-meta">
              <span>Active: <span id="stat-active-teams">0</span></span> | <span>Waiting: <span id="stat-waiting-teams">0</span></span> | <span>Finished: <span id="stat-finished-teams">0</span></span>
            </div>
            <div class="admin-card-actions">
              <button id="btn-view-answers" class="btn btn-sm btn-outline" style="width: 100%;">View Master Answer Key</button>
            </div>
          </div>
        </div>

        <!-- Master Teams Table -->
        <h3 style="font-size: 1.1rem; color: var(--accent-primary); margin-bottom: 10px;">Registered Teams &amp; Live Progression</h3>
        <div class="admin-table-wrapper" style="margin-bottom: 24px;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Team Name</th>
                <th>Coordinator</th>
                <th>Operatives</th>
                <th>Progression</th>
                <th>Time / Penalty</th>
                <th>Violations</th>
                <th>Verify Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-teams-tbody">
              <tr><td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted);">Loading registered teams...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Dedicated Hint Management Section (Collapsible) -->
        <div id="admin-hints-section" style="display: none; background: var(--bg-card); border: 1px solid var(--border-warning); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 1.1rem; color: var(--accent-warning); margin: 0;">Central Hint Configuration &amp; Policies</h3>
            <span style="font-size: 0.82rem; color: var(--text-muted);">Edits persist across sessions</span>
          </div>
          <div style="overflow-x: auto;">
            <table class="admin-table admin-hints-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Stage</th>
                  <th>Module</th>
                  <th>Hint Text</th>
                  <th>Duration (s)</th>
                  <th>Penalty (m)</th>
                  <th style="text-align: center;">Enabled</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="admin-hints-tbody">
                <tr><td colspan="8" style="padding: 16px; text-align: center; color: var(--text-muted);">Loading hints...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Details Drawer / Modal Container -->
      <div id="admin-details-modal" class="admin-modal-overlay" style="display: none;">
        <div class="admin-modal-card">
          <div class="admin-modal-header">
            <h3 id="admin-modal-title">Team Dossier</h3>
            <button id="btn-close-modal" class="btn btn-sm btn-outline">&times;</button>
          </div>
          <div id="admin-modal-body"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-admin-refresh')?.addEventListener('click', loadData);
    document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
      sessionStorage.removeItem('fo_admin_pin');
      if (adminPollInterval) clearInterval(adminPollInterval);
      if (adminClockTickInterval) clearInterval(adminClockTickInterval);
      renderAdminView(container, controller);
    });

    const hintsSec = document.getElementById('admin-hints-section');
    document.getElementById('btn-toggle-hints')?.addEventListener('click', () => {
      if (hintsSec) {
        const isHidden = hintsSec.style.display === 'none';
        hintsSec.style.display = isHidden ? 'block' : 'none';
        if (isHidden) loadHintsData();
      }
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      const modal = document.getElementById('admin-details-modal');
      if (modal) modal.style.display = 'none';
    });

    // Save Hint Event Delegation
    document.getElementById('admin-hints-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-save-hint');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const row = btn.closest('tr');
      if (!row || !id) return;

      btn.disabled = true;
      btn.textContent = 'Saving...';

      if (id === 'stage_1_policy') {
        const duration = parseInt(row.querySelector('.hint-duration-input')?.value || '30', 10);
        const scheduleStr = row.querySelector('.hint-schedule-input')?.value || '3,5';
        const enabled = row.querySelector('.hint-enabled-toggle')?.checked;
        const schedule = scheduleStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);

        try {
          const res = await fetch('/api/admin/hints/stage_1_policy', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
            body: JSON.stringify({
              displaySeconds: duration,
              costScheduleMinutes: schedule,
              enabled
            })
          });
          const result = await res.json();
          if (res.ok && result.success) {
            controller.showToast('Stage 1 hint policy updated.');
            btn.textContent = 'Saved';
            setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1200);
          } else {
            alert(result.error || 'Failed to update policy.');
            btn.disabled = false;
            btn.textContent = 'Save';
          }
        } catch {
          alert('Network failure saving policy.');
          btn.disabled = false;
          btn.textContent = 'Save';
        }
        return;
      }

      const text = row.querySelector('.hint-text-input')?.value.trim();
      const duration = parseInt(row.querySelector('.hint-duration-input')?.value || '0', 10);
      const penalty = parseInt(row.querySelector('.hint-penalty-input')?.value || '3', 10);
      const enabled = row.querySelector('.hint-enabled-toggle')?.checked;

      try {
        const res = await fetch(`/api/admin/hints/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({
            text,
            displayDurationSeconds: duration,
            penaltyMinutes: penalty,
            enabled
          })
        });
        const result = await res.json();
        if (res.ok && result.success) {
          controller.showToast(`Hint ${id} updated.`);
          btn.textContent = 'Saved';
          setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1200);
        } else {
          alert(result.error || 'Failed to update hint.');
          btn.disabled = false;
          btn.textContent = 'Save';
        }
      } catch {
        alert('Network failure saving hint.');
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });

    document.getElementById('btn-clock-toggle')?.addEventListener('click', async () => {
      await fetch('/api/admin/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ action: 'toggle' })
      });
      loadData();
    });

    document.getElementById('btn-clock-launch')?.addEventListener('click', async () => {
      if (!confirm('Launch all waiting teams simultaneously?')) return;
      await fetch('/api/admin/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin }
      });
      loadData();
    });

    document.getElementById('btn-admin-freeze')?.addEventListener('click', async () => {
      const freeze = confirm('Freeze the public leaderboard snapshot? Participants will see static scores until unfrozen.');
      await fetch('/api/admin/freeze-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ frozen: freeze })
      });
      alert(freeze ? 'Leaderboard frozen successfully.' : 'Leaderboard unfrozen.');
    });

    document.getElementById('btn-view-answers')?.addEventListener('click', async () => {
      const res = await fetch('/api/admin/answers', { headers: { 'x-admin-pin': adminPin } });
      const answers = await res.json();
      console.log('Master Answer Key:', answers);
      alert('Answer key logged to developer console, or see printed organizer reference.');
    });

    // Event delegation on tbody for per-team action buttons & team detail drawer
    const tbody = document.getElementById('admin-teams-tbody');
    tbody?.addEventListener('click', async (e) => {
      const nameBtn = e.target.closest('.admin-team-name-btn');
      if (nameBtn) {
        const teamId = nameBtn.getAttribute('data-team-id');
        showTeamDetails(teamId);
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;
      const teamId = btn.getAttribute('data-id');
      if (!teamId) return;

      if (btn.classList.contains('btn-reissue-leader')) {
        if (!confirm('Generate a new 6-digit recovery code? This invalidates the leader\'s old session.')) return;
        try {
          const res = await fetch(`/api/admin/team/${teamId}/reissue-leader`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin }
          });
          const result = await res.json();
          if (res.ok && result.success) {
            prompt(`One-Time Recovery Code for ${result.teamName} (valid 10m):`, result.code);
            loadData();
          } else {
            alert(result.error || 'Failed to reissue code.');
          }
        } catch {
          alert('Network error.');
        }
      } else if (btn.classList.contains('btn-skip-team')) {
        if (!confirm('Advance this team to the next stage?')) return;
        await fetch('/api/admin/skip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ teamId })
        });
        loadData();
      } else if (btn.classList.contains('btn-restart-team')) {
        if (!confirm('Restart this team back to Stage 1? All progress will be wiped.')) return;
        await fetch('/api/admin/team-restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ teamId })
        });
        loadData();
      } else if (btn.classList.contains('btn-delete-team')) {
        if (!confirm('Permanently delete this team?')) return;
        await fetch('/api/admin/reset-team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ teamId })
        });
        loadData();
      }
    });

    // Start local 1-second clock ticker
    if (adminClockTickInterval) clearInterval(adminClockTickInterval);
    adminClockTickInterval = setInterval(tickAdminClock, 1000);
  }

  let latestTeamsData = [];

  function showTeamDetails(teamId) {
    const team = latestTeamsData.find(t => t.id === teamId);
    if (!team) return;

    const modal = document.getElementById('admin-details-modal');
    const title = document.getElementById('admin-modal-title');
    const body = document.getElementById('admin-modal-body');
    if (!modal || !title || !body) return;

    title.textContent = `Dossier: ${team.name}`;
    body.innerHTML = `
      <div class="admin-modal-section">
        <div class="admin-modal-label">Coordinator &amp; Status</div>
        <div style="font-size: 0.95rem; font-weight: 600;">Coordinator: <span style="color: var(--accent-warning);">${esc(team.coordinator)}</span> | Status: <span style="text-transform: uppercase;">${esc(team.status)}</span></div>
      </div>
      <div class="admin-modal-section">
        <div class="admin-modal-label">Registered Operatives (${(team.members || []).length})</div>
        <ul style="margin: 4px 0 0; padding-left: 20px; font-size: 0.88rem;">
          ${(team.members || []).map(m => `
            <li><strong>${esc(m.fullName)}</strong> ${m.isLeader ? '<span class="badge" style="font-size: 0.7rem;">LEADER</span>' : ''} ${m.joined ? '<span style="color: var(--accent-success);">(Connected)</span>' : '<span style="color: var(--text-muted);">(Waiting)</span>'}</li>
          `).join('')}
        </ul>
      </div>
      <div class="admin-modal-section">
        <div class="admin-modal-label">Progression &amp; Attempts</div>
        <div style="font-size: 0.88rem;">Current Stage: <strong>Stage ${team.stage} of 6</strong></div>
        <div style="font-size: 0.88rem;">Total Wrong Attempts: <strong>${team.totalWrong || 0}</strong> | Hints Used: <strong>${team.totalHints || 0}</strong></div>
        <div style="font-size: 0.88rem;">Violations (Tab Switches): <strong style="color: ${team.tabSwitches > 0 ? 'var(--accent-danger)' : 'inherit'};">${team.tabSwitches || 0}</strong></div>
      </div>
      <div class="admin-modal-section">
        <div class="admin-modal-label">Timing &amp; Verification</div>
        <div style="font-size: 0.88rem; font-family: var(--font-mono);">Elapsed Time: <strong>${esc(team.formattedTime)}</strong> (+${team.penaltyMin || 0}m penalty)</div>
        <div style="font-size: 0.88rem; font-family: var(--font-mono); margin-top: 4px;">Verification Code: <strong style="color: var(--accent-warning);">${esc(team.verificationCode || 'IN PROGRESS')}</strong></div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  function tickAdminClock() {
    if (!currentEventState) return;
    const clockValEl = document.getElementById('admin-live-clock') || document.getElementById('admin-clock-value');
    const clockCapEl = document.getElementById('admin-clock-cap-remaining');
    if (!clockValEl) return;

    const now = Date.now() + clientClockOffset;
    const isPaused = currentEventState.isPaused;
    const startedAt = currentEventState.startedAt;
    const totalPausedMs = currentEventState.totalPausedMs || 0;
    const capMinutes = currentEventState.capMinutes || 90;

    let elapsedMs = 0;
    if (startedAt) {
      if (isPaused && currentEventState.pausedAt) {
        elapsedMs = currentEventState.pausedAt - startedAt - totalPausedMs;
      } else {
        elapsedMs = now - startedAt - totalPausedMs;
      }
    }
    if (elapsedMs < 0) elapsedMs = 0;

    const totalSecs = Math.floor(elapsedMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    clockValEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (clockCapEl && startedAt) {
      const capMs = capMinutes * 60 * 1000;
      const remainingMs = Math.max(0, capMs - elapsedMs);
      const remMins = Math.floor(remainingMs / 60000);
      const remSecs = Math.floor((remainingMs % 60000) / 1000);
      if (remainingMs === 0) {
        clockCapEl.textContent = 'CAP EXPIRED';
        clockCapEl.style.color = 'var(--accent-danger)';
      } else {
        clockCapEl.textContent = `Cap: ${remMins}m ${remSecs}s remaining`;
        clockCapEl.style.color = 'var(--text-secondary)';
      }
    }
  }

  function renderStageBar(currentStage, isFinished) {
    const segments = [];
    for (let s = 1; s <= 6; s++) {
      let cls = 'locked';
      if (isFinished || s < currentStage) {
        cls = 'done';
      } else if (s === currentStage) {
        cls = 'active';
      }
      segments.push(`<div class="admin-stage-seg segment ${cls}">${s}</div>`);
    }
    return `<div class="admin-stage-bar mini-stage-segments">${segments.join('')}</div>`;
  }

  function updateDashboard(data) {
    let tbody = document.getElementById('admin-teams-tbody');
    if (!tbody) {
      initAdminShell();
      tbody = document.getElementById('admin-teams-tbody');
    }

    latestTeamsData = data.teams || [];
    const teams = latestTeamsData;
    const isClockPaused = data.event?.isPaused ?? data.isClockPaused;
    const eventStarted = Boolean(data.event?.startedAt) || data.isGameStarted;

    if (data.serverNow) {
      clientClockOffset = data.serverNow - Date.now();
    }
    currentEventState = data.event || {
      startedAt: eventStarted ? Date.now() : null,
      isPaused: isClockPaused,
      totalPausedMs: 0,
      capMinutes: 90
    };

    // Update Provider Badge
    const provBadge = document.getElementById('admin-db-provider-badge');
    if (provBadge) {
      provBadge.textContent = `PROVIDER: ${(data.provider || 'SQLITE').toUpperCase()}`;
    }

    // Update Clock Card
    const clockBadge = document.getElementById('admin-clock-badge');
    const clockBtn = document.getElementById('btn-clock-toggle');
    const modeLabel = document.getElementById('admin-clock-mode-label');

    if (clockBadge) {
      if (!eventStarted) {
        clockBadge.textContent = 'WAITING';
        clockBadge.className = 'admin-clock-status-badge waiting';
      } else if (isClockPaused) {
        clockBadge.textContent = 'PAUSED';
        clockBadge.className = 'admin-clock-status-badge paused';
      } else {
        clockBadge.textContent = 'RUNNING';
        clockBadge.className = 'admin-clock-status-badge running';
      }
    }

    if (clockBtn) {
      clockBtn.textContent = isClockPaused ? 'Resume Clock' : 'Pause Clock';
    }

    if (modeLabel) {
      modeLabel.textContent = `Mode: ${data.mode === 'start_together' ? 'Start Together' : 'Self-Paced'}`;
    }

    // Update Counts
    const teamCountEl = document.getElementById('admin-team-count');
    const countsEl = document.getElementById('admin-counts-breakdown');
    const counts = data.counts || { total: teams.length, active: 0, waiting: 0, finished: 0 };

    const statTotal = document.getElementById('stat-total-teams');
    const statActive = document.getElementById('stat-active-teams');
    const statWaiting = document.getElementById('stat-waiting-teams');
    const statFinished = document.getElementById('stat-finished-teams');

    if (statTotal) statTotal.textContent = String(counts.total ?? teams.length);
    if (statActive) statActive.textContent = String(counts.active || 0);
    if (statWaiting) statWaiting.textContent = String(counts.waiting || 0);
    if (statFinished) statFinished.textContent = String(counts.finished || 0);

    if (teamCountEl && !statTotal) {
      teamCountEl.textContent = `${counts.total || teams.length} Registered Teams`;
    }
    if (countsEl && !statActive) {
      countsEl.innerHTML = `<span>Active: ${counts.active || 0}</span> | <span>Waiting: ${counts.waiting || 0}</span> | <span>Finished: ${counts.finished || 0}</span>`;
    }

    // Tbody rows rendering & in-place DOM patching
    if (teams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted);">No teams currently registered.</td></tr>`;
      return;
    }

    const teamIds = new Set(teams.map(t => t.id));

    // Remove defunct rows
    Array.from(tbody.querySelectorAll('tr[data-team-id]')).forEach(tr => {
      const id = tr.getAttribute('data-team-id');
      if (!teamIds.has(id)) tr.remove();
    });

    // Remove loading or placeholder rows
    const placeholder = tbody.querySelector('td[colspan="8"]');
    if (placeholder) placeholder.parentElement.remove();

    teams.forEach(t => {
      let tr = tbody.querySelector(`tr[data-team-id="${t.id}"]`);
      const violColor = (t.tabSwitches || 0) > 0 ? 'var(--accent-danger)' : 'var(--text-muted)';
      const stageBarHtml = renderStageBar(t.stage, Boolean(t.finishedAt));

      if (!tr) {
        tr = document.createElement('tr');
        tr.setAttribute('data-team-id', t.id);
        tr.innerHTML = `
          <td data-field="name">
            <button class="admin-team-name-btn" data-team-id="${t.id}">${esc(t.name)}</button>
          </td>
          <td data-field="coord" style="font-size: 0.86rem; color: var(--accent-warning);">${esc(t.coordinator)}</td>
          <td data-field="members" style="font-size: 0.85rem;">${(t.members || []).map(m => esc(m.fullName)).join(', ')}</td>
          <td data-field="stage">${stageBarHtml}</td>
          <td data-field="time" class="admin-time-cell">${esc(t.formattedTime)} <span style="color: var(--accent-danger); font-size: 0.8rem;">(+${t.penaltyMin || 0}m)</span></td>
          <td data-field="violations" style="font-size: 0.85rem; color: ${violColor};">${t.tabSwitches || 0} switches</td>
          <td data-field="code" style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent-warning);">${esc(t.verificationCode || '-')}</td>
          <td style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-outline btn-reissue-leader" data-id="${t.id}" title="Reissue leader recovery code">Reissue</button>
            <button class="btn btn-sm btn-outline btn-skip-team" data-id="${t.id}">Skip</button>
            <button class="btn btn-sm btn-outline btn-restart-team" data-id="${t.id}" style="color: var(--accent-warning);">Restart</button>
            <button class="btn btn-sm btn-outline btn-delete-team btn-danger-outline" data-id="${t.id}">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      } else {
        // In-place DOM updates for existing row
        const stageTd = tr.querySelector('td[data-field="stage"]');
        if (stageTd && stageTd.innerHTML !== stageBarHtml) {
          stageTd.innerHTML = stageBarHtml;
        }

        const timeTd = tr.querySelector('td[data-field="time"]');
        const timeHtml = `${esc(t.formattedTime)} <span style="color: var(--accent-danger); font-size: 0.8rem;">(+${t.penaltyMin || 0}m)</span>`;
        if (timeTd && timeTd.innerHTML !== timeHtml) {
          timeTd.innerHTML = timeHtml;
        }

        const violTd = tr.querySelector('td[data-field="violations"]');
        const violText = `${t.tabSwitches || 0} switches`;
        if (violTd && violTd.textContent !== violText) {
          violTd.textContent = violText;
          violTd.style.color = violColor;
        }

        const codeTd = tr.querySelector('td[data-field="code"]');
        if (codeTd && codeTd.textContent !== (t.verificationCode || '-')) {
          codeTd.textContent = t.verificationCode || '-';
        }
      }
    });

    tickAdminClock();
  }

  initAdminShell();
  await loadData();
  adminPollInterval = setInterval(loadData, 5000);
}
