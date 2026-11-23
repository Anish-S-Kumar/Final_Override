// FINAL OVERRIDE — Main Application Controller (ES Module)
import { esc, setText, renderStartScreen, renderWaitingLobby } from './views/lobby.js';
import { renderStageScreen, renderResultScreen } from './views/stages.js';
import { renderCoordinatorView } from './views/coordinator.js';
import { renderAdminView } from './views/admin.js';

// Expose esc and setText globally
window.esc = esc;
window.setText = setText;
window.escapeHtml = esc;

let gameState = null;
let lastKnownStateVersion = null;
let liveTimerInterval = null;
let playerPollInterval = null;
let lobbyPollInterval = null;
let antiCheatInitDone = false;
let pageLoadedTime = Date.now();
let lastStageChangeTime = Date.now();
let lastCountedTabPenaltyTime = 0;

let currentBaseOffset = 0;
let currentTeamStartedAt = 0;
let currentTeamPausedMs = 0;

export function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
window.showToast = showToast;

function getRoute() {
  const path = window.location.pathname.toLowerCase();
  if (path === '/coordinator' || path.startsWith('/coordinator/')) return 'coordinator';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/leaderboard' || path.startsWith('/leaderboard/')) return 'leaderboard';
  return 'game';
}

export async function fetchState(version) {
  try {
    const url = version ? `/api/state?v=${encodeURIComponent(version)}` : '/api/state';
    const headers = version ? { 'If-None-Match': version } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function updateStickyBar(state) {
  const bar = document.getElementById('sticky-status-bar');
  if (!bar) return;

  if (!state || !state.team || state.team.finishedAt || state.waitingInLobby || getRoute() !== 'game') {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';
  setText('status-team-name', state.team.name);
  setText('status-stage-display', `STAGE ${state.team.stage} / 6`);
  setText('status-penalty', `+${state.team.penaltyMin || 0}m`);

  const fillEl = document.getElementById('stage-progress-fill');
  if (fillEl) {
    const pct = Math.min(100, Math.round(((state.team.stage - 1) / 6) * 100));
    fillEl.style.width = `${pct}%`;
  }

  // Highlight step in rail
  const railSteps = document.querySelectorAll('.rail-step');
  railSteps.forEach((step, idx) => {
    const stepNum = idx + 1;
    if (stepNum < state.team.stage) {
      step.className = 'rail-step completed';
    } else if (stepNum === state.team.stage) {
      step.className = 'rail-step active';
    } else {
      step.className = 'rail-step';
    }
  });

  // Update compact intelligence dossier strip under HUD
  updateDossierStrip(state);
}

export function updateDossierStrip(state) {
  if (!state || !state.team) return;

  const currentStage = state.team.stage;
  const fragments = state.notebook || (state.team && state.team.fragments) || {};
  const stageDefs = [
    { num: 1, name: 'Signal Intercept & Morse Matrix', short: '1 Intercept', icon: '#icon-signal' },
    { num: 2, name: 'Decoding', short: '2 Decode', icon: '#icon-cipher' },
    { num: 3, name: 'Prompt the AI (WARDEN)', short: '3 WARDEN', icon: '#icon-terminal' },
    { num: 4, name: 'CTF Challenges', short: '4 CTF', icon: '#icon-flag' },
    { num: 5, name: 'Team Sync & Multi-Device Link', short: '5 Sync', icon: '#icon-users' },
    { num: 6, name: 'Final Integration & Master Override', short: '6 Override', icon: '#icon-lock' }
  ];

  const stageDisplay = document.getElementById('status-stage-display');
  if (stageDisplay) {
    stageDisplay.textContent = `STAGE ${currentStage} / 6`;
  }

  // Update merged single tactical rail
  const rail = document.getElementById('master-stage-rail');
  if (rail) {
    stageDefs.forEach(s => {
      const stepEl = rail.querySelector(`.rail-step[data-stage="${s.num}"]`) || rail.querySelector(`[data-slot="${s.num}"]`);
      if (!stepEl) return;
      const val = fragments[s.num] || fragments[String(s.num)] || fragments[`stage_${s.num}`];
      const isSolved = Boolean(val);
      const isCurrent = !isSolved && s.num === currentStage;

      let targetClass = 'rail-step locked';
      let targetHtml = `<svg class="ui-icon ui-icon-muted" width="14" height="14"><use href="#icon-lock"></use></svg><span>${esc(s.short)}</span>`;

      if (isSolved) {
        targetClass = 'rail-step solved done';
        targetHtml = `<svg class="ui-icon" width="14" height="14"><use href="#icon-check"></use></svg><span class="tabular-nums" style="font-weight:700;">${esc(val)}</span>`;
      } else if (isCurrent) {
        targetClass = 'rail-step active current';
        targetHtml = `<svg class="ui-icon" width="14" height="14"><use href="${s.icon}"></use></svg><span>${esc(s.short)}</span>`;
      }

      if (stepEl.className !== targetClass) {
        stepEl.className = targetClass;
      }
      if (stepEl.innerHTML !== targetHtml) {
        stepEl.innerHTML = targetHtml;
      }
    });
  }

  // Update expanded details grid if panel exists
  const expandedGrid = document.getElementById('dossier-expanded-grid');
  if (expandedGrid) {
    const gridHtml = stageDefs.map(s => {
      const val = fragments[s.num] || fragments[String(s.num)] || fragments[`stage_${s.num}`];
      return `
        <div class="dossier-expanded-item ${val ? 'solved' : (s.num === currentStage ? 'current' : 'locked')}">
          <div class="dossier-expanded-item-header">Stage ${s.num}: ${esc(s.name)}</div>
          <div class="dossier-expanded-item-val tabular-nums">${val ? esc(val) : (s.num === currentStage ? 'IN PROGRESS' : 'LOCKED')}</div>
        </div>
      `;
    }).join('');
    if (expandedGrid.dataset.lastHtml !== gridHtml) {
      expandedGrid.dataset.lastHtml = gridHtml;
      expandedGrid.innerHTML = gridHtml;
    }
  }
}

function initModalsAndDrawers() {
  // Expandable Dossier Panel
  const btnToggleNotebook = document.getElementById('btn-toggle-notebook');
  const dossierExpandedPanel = document.getElementById('dossier-expanded-panel');
  const btnCloseDossier = document.getElementById('btn-close-dossier');
  const dossierNotesInput = document.getElementById('dossier-notes-input');

  function toggleDossierPanel(forceState) {
    if (!dossierExpandedPanel) return;
    const isVisible = dossierExpandedPanel.style.display !== 'none';
    const nextState = typeof forceState === 'boolean' ? forceState : !isVisible;
    dossierExpandedPanel.style.display = nextState ? 'block' : 'none';
    if (gameState && gameState.team) {
      try {
        sessionStorage.setItem(`fo_dossier_expanded_${gameState.team.id}`, nextState ? '1' : '0');
      } catch { }
    }
  }

  if (btnToggleNotebook) {
    btnToggleNotebook.onclick = () => toggleDossierPanel();
  }
  if (btnCloseDossier) {
    btnCloseDossier.onclick = () => toggleDossierPanel(false);
  }

  if (dossierNotesInput) {
    if (gameState && gameState.team) {
      try {
        const savedNotes = sessionStorage.getItem(`fo_dossier_notes_${gameState.team.id}`);
        if (savedNotes !== null) dossierNotesInput.value = savedNotes;
      } catch { }
    }
    dossierNotesInput.oninput = () => {
      if (gameState && gameState.team) {
        try {
          sessionStorage.setItem(`fo_dossier_notes_${gameState.team.id}`, dossierNotesInput.value);
        } catch { }
      }
    };
  }

  // Restore saved expanded state if team active
  if (gameState && gameState.team && dossierExpandedPanel) {
    try {
      const isSavedOpen = sessionStorage.getItem(`fo_dossier_expanded_${gameState.team.id}`) === '1';
      dossierExpandedPanel.style.display = isSavedOpen ? 'block' : 'none';
    } catch { }
  }

  // Coordinator Assistance Modal
  const btnCallCoord = document.getElementById('btn-call-coordinator');
  const helpModal = document.getElementById('coordinator-help-modal');
  const btnCloseHelp = document.getElementById('btn-close-help-modal');
  const btnDismissHelp = document.getElementById('btn-dismiss-help');
  const helpCoordName = document.getElementById('help-coord-name');

  function openHelpModal() {
    if (helpCoordName) {
      helpCoordName.textContent = (gameState && gameState.team && gameState.team.coordinator)
        ? gameState.team.coordinator
        : 'Assigned Lab Supervisor';
    }
    if (helpModal) helpModal.style.display = 'flex';
  }

  function closeHelpModal() {
    if (helpModal) helpModal.style.display = 'none';
  }

  if (btnCallCoord) btnCallCoord.onclick = openHelpModal;
  if (btnCloseHelp) btnCloseHelp.onclick = closeHelpModal;
  if (btnDismissHelp) btnDismissHelp.onclick = closeHelpModal;
}

function startLiveTimer(team, serverTime) {
  currentTeamStartedAt = team.startedAt || Date.now();
  currentTeamPausedMs = team.pausedMs || 0;
  if (serverTime) {
    currentBaseOffset = serverTime - Date.now();
  }

  const timeDisplay = document.getElementById('status-time-display');
  if (!timeDisplay || team.finishedAt || team.status === 'waiting') {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    return;
  }

  function tick() {
    const effectiveNow = Date.now() + currentBaseOffset;
    let elapsedMs = effectiveNow - currentTeamStartedAt - currentTeamPausedMs;
    if (elapsedMs < 0) elapsedMs = 0;
    const totalSecs = Math.floor(elapsedMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    timeDisplay.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  tick();
  if (!liveTimerInterval) {
    liveTimerInterval = setInterval(tick, 1000);
  }
}

function updateClockDrift(serverTime, pausedMs) {
  if (serverTime) {
    currentBaseOffset = serverTime - Date.now();
  }
  if (typeof pausedMs === 'number') {
    currentTeamPausedMs = pausedMs;
  }
}

// Anti-Cheat: visibilitychange-only listener, 5s debounce, 3s grace period, Stage 4 exempt
function initAntiCheat() {
  if (antiCheatInitDone) return;
  antiCheatInitDone = true;

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) return; // Only trigger when tab hidden
    if (!gameState || !gameState.team || gameState.team.finishedAt || gameState.waitingInLobby) return;
    if (getRoute() !== 'game') return;

    // Stage 4 is exempt
    if (gameState.team.stage === 4) {
      return;
    }

    const now = Date.now();
    // 3-second grace period after load or stage transition
    if (now - pageLoadedTime < 3000 || now - lastStageChangeTime < 3000) {
      return;
    }

    // 5-second debounce
    if (now - lastCountedTabPenaltyTime < 5000) {
      return;
    }

    try {
      const res = await fetch('/api/tab-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTimestamp: now })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.penaltyAdded > 0) {
          lastCountedTabPenaltyTime = now;
          const container = document.getElementById('app-main');
          const alertEl = document.createElement('div');
          alertEl.className = 'cheat-alert-banner';
          alertEl.innerHTML = `
            <svg class="ui-icon" width="22" height="22" style="color: var(--accent-danger);"><use href="#icon-alert"></use></svg>
            <div style="flex: 1;">
              <div style="font-weight: bold; color: var(--accent-danger); font-size: 1rem;">Anti-Tamper Protocol Alert</div>
              <div style="font-size: 0.9rem; margin-top: 2px;">Tab focus departure recorded. +${data.penaltyAdded} min penalty added (Incident #${data.tabSwitches}). Cumulative penalty: +${data.totalPenaltyMin}m.</div>
            </div>
            <button class="btn btn-sm btn-outline" style="border-color: var(--accent-danger); color: var(--accent-danger);" onclick="this.parentElement.remove()">Acknowledge</button>
          `;
          if (container && container.firstChild) container.insertBefore(alertEl, container.firstChild);
          const updated = await fetchState();
          if (updated && !updated.notModified) {
            gameState = updated;
            updateStickyBar(updated);
          }
        }
      }
    } catch (err) {
      console.error('Tab penalty reporting error:', err);
    }
  });
}

// Player view 5-second state polling loop (pauses while tab is hidden)
function startPlayerPolling() {
  if (playerPollInterval) clearInterval(playerPollInterval);

  async function poll() {
    if (document.hidden) return; // Paused while tab is hidden
    if (getRoute() !== 'game') {
      stopPlayerPolling();
      return;
    }
    if (!gameState || !gameState.team || gameState.team.finishedAt || gameState.waitingInLobby) {
      return;
    }

    const data = await fetchState(lastKnownStateVersion);
    if (!data) return;

    if (data.notModified) {
      // Nothing changed! Update clock drift only, do not touch DOM
      updateClockDrift(data.serverTime);
      return;
    }

    // State changed
    lastKnownStateVersion = data.version || null;
    gameState = data;
    updateStickyBar(data);
    updateClockDrift(data.serverTime, data.team.pausedMs);

    if (data.waitingInLobby || data.team.finishedAt) {
      renderApp();
      return;
    }

    const container = document.getElementById('app-main');
    if (container) {
      renderStageScreen(container, data, { renderApp, showToast });
    }
  }

  playerPollInterval = setInterval(poll, 5000);
}

function stopPlayerPolling() {
  if (playerPollInterval) {
    clearInterval(playerPollInterval);
    playerPollInterval = null;
  }
}

// Resume polling immediately when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && getRoute() === 'game' && gameState && gameState.team && !gameState.team.finishedAt) {
    fetchState(lastKnownStateVersion).then(data => {
      if (data && !data.notModified) {
        lastKnownStateVersion = data.version;
        gameState = data;
        updateStickyBar(data);
        updateClockDrift(data.serverTime, data.team.pausedMs);
        const container = document.getElementById('app-main');
        if (container) renderStageScreen(container, data, { renderApp, showToast });
      }
    });
  }
});

export async function renderApp() {
  const container = document.getElementById('app-main');
  if (!container) return;

  const route = getRoute();

  if (route === 'coordinator') {
    stopPlayerPolling();
    updateStickyBar(null);
    renderCoordinatorView(container, { renderApp, showToast });
    return;
  }

  if (route === 'admin') {
    stopPlayerPolling();
    updateStickyBar(null);
    renderAdminView(container, { renderApp, showToast });
    return;
  }

  if (route === 'leaderboard') {
    stopPlayerPolling();
    updateStickyBar(null);
    renderLeaderboardView(container);
    return;
  }

  // Route is 'game'
  gameState = await fetchState();

  if (!gameState || !gameState.team) {
    stopPlayerPolling();
    updateStickyBar(null);
    renderStartScreen(container, { renderApp, showToast });
    return;
  }

  lastKnownStateVersion = gameState.version || null;
  updateStickyBar(gameState);
  initAntiCheat();

  if (gameState.waitingInLobby) {
    stopPlayerPolling();
    renderWaitingLobby(container, gameState, {
      renderApp,
      showToast,
      startLobbyPolling() {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        lobbyPollInterval = setInterval(async () => {
          const s = await fetchState();
          if (s && s.team && !s.waitingInLobby && s.team.status !== 'waiting') {
            clearInterval(lobbyPollInterval);
            lobbyPollInterval = null;
            showToast('Mission launched! Commencing operations.');
            renderApp();
          }
        }, 3000);
      }
    });
    return;
  }

  if (gameState.team.finishedAt) {
    stopPlayerPolling();
    renderResultScreen(container, gameState, { renderApp, showToast });
    return;
  }

  // Active game stage
  lastStageChangeTime = Date.now();
  startLiveTimer(gameState.team, gameState.serverTime);
  renderStageScreen(container, gameState, { renderApp, showToast });
  startPlayerPolling();
}

let lbPollInterval = null;

async function renderLeaderboardView(container) {
  if (lbPollInterval) clearInterval(lbPollInterval);

  async function loadData() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      updateLeaderboard(data);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
    }
  }

  function initLeaderboardShell() {
    container.innerHTML = `
      <div id="lb-card" class="card page-enter" style="max-width: 1040px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 18px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 14px;">
          <h1 style="font-size: clamp(1.8rem, 4vw, 2.4rem); color: var(--text-primary); letter-spacing: 2px;">
            OFFICIAL MISSION LEADERBOARD
          </h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 4px;">
            Department of Computer Science &amp; Engineering &middot; Vidyavardhaka College of Engineering
          </p>
          <div id="lb-frozen-banner-wrap" style="margin-top: 6px;"></div>
        </div>

        <!-- Official Master Timer -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px; text-align: center; margin-bottom: 20px;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Official Master Clock</div>
          <div id="lb-clock-value" class="tabular-nums" style="font-family: var(--font-mono); font-size: 3rem; color: var(--accent-primary); margin: 6px 0;">00:00</div>
          <div id="lb-clock-status" style="font-size: 0.88rem; font-weight: bold;">--</div>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-subtle); color: var(--text-muted); text-transform: uppercase; font-size: 0.78rem;">
                <th style="padding: 12px; width: 80px;">Rank</th>
                <th style="padding: 12px;">Squad</th>
                <th style="padding: 12px;">Coordinator</th>
                <th style="padding: 12px;">Stage</th>
                <th style="padding: 12px;">Elapsed / Penalty</th>
                <th style="padding: 12px;">Hints</th>
                <th style="padding: 12px;">Incorrect</th>
              </tr>
            </thead>
            <tbody id="lb-tbody">
              <tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted);">Retrieving official standings...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function updateLeaderboard(data) {
    let tbody = document.getElementById('lb-tbody');
    if (!tbody) {
      initLeaderboardShell();
      tbody = document.getElementById('lb-tbody');
    }

    const clock = data.clock || {};
    const clockVal = document.getElementById('lb-clock-value');
    const clockStatus = document.getElementById('lb-clock-status');
    const frozenWrap = document.getElementById('lb-frozen-banner-wrap');

    if (clockVal) clockVal.textContent = clock.formattedTime || '00:00';
    if (clockStatus) {
      clockStatus.textContent = clock.isPaused ? 'STATUS: PAUSED' : 'STATUS: LIVE RUNNING';
      clockStatus.style.color = clock.isPaused ? 'var(--accent-danger)' : 'var(--accent-success)';
    }
    if (frozenWrap) {
      frozenWrap.innerHTML = data.isFrozen
        ? `<div style="display: inline-block; background: var(--accent-primary-dim); border: 1px solid var(--border-accent); color: var(--accent-primary); padding: 4px 14px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: bold;">STANDINGS FROZEN FOR FINAL AUDIT</div>`
        : '';
    }

    const teams = data.teams || [];
    if (teams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted);">No squads registered yet.</td></tr>`;
      return;
    }

    const teamIds = new Set(teams.map(t => t.id || t.name));

    // Remove rows no longer present
    Array.from(tbody.querySelectorAll('tr[data-team-id]')).forEach(tr => {
      const id = tr.getAttribute('data-team-id');
      if (!teamIds.has(id)) tr.remove();
    });

    // Remove placeholder
    const placeholder = tbody.querySelector('td[colspan="7"]');
    if (placeholder) placeholder.parentElement.remove();

    teams.forEach((t, idx) => {
      const rowId = t.id || t.name;
      const rankBadge = `${idx + 1}`;

      let tr = tbody.querySelector(`tr[data-team-id="${rowId}"]`);
      if (!tr) {
        tr = document.createElement('tr');
        tr.setAttribute('data-team-id', rowId);
        tr.style.borderBottom = '1px solid var(--border-subtle)';
        tr.innerHTML = `
          <td data-field="rank" style="padding: 12px; font-weight: bold; font-size: 1.1rem; color: var(--accent-warning);">${rankBadge}</td>
          <td data-field="name" style="padding: 12px; font-weight: bold; font-size: 1.1rem; color: var(--text-primary);">${esc(t.name)}</td>
          <td data-field="coord" style="padding: 12px; font-size: 0.9rem; color: var(--text-muted);">${esc(t.coordinator || '-')}</td>
          <td data-field="stage" style="padding: 12px; font-weight: bold; color: ${t.isFinished ? 'var(--accent-success)' : 'var(--accent-primary)'};">${esc(t.stageText)}</td>
          <td data-field="time" class="tabular-nums" style="padding: 12px; font-family: var(--font-mono); font-size: 1.1rem; font-weight: bold;">${esc(t.formattedTime)} <span style="font-size: 0.8rem; color: var(--accent-danger);">(+${t.penaltyMin}m)</span></td>
          <td data-field="hints" style="padding: 12px; color: var(--text-secondary);">${t.totalHints}</td>
          <td data-field="wrong" style="padding: 12px; color: var(--text-secondary);">${t.totalWrong}</td>
        `;
        tbody.appendChild(tr);
      } else {
        // Patch only changed values
        const rankTd = tr.querySelector('td[data-field="rank"]');
        if (rankTd && rankTd.textContent !== rankBadge) rankTd.textContent = rankBadge;

        const stageTd = tr.querySelector('td[data-field="stage"]');
        if (stageTd && stageTd.textContent !== t.stageText) {
          stageTd.textContent = t.stageText;
          stageTd.style.color = t.isFinished ? 'var(--accent-success)' : 'var(--accent-primary)';
        }

        const timeTd = tr.querySelector('td[data-field="time"]');
        const timeHtml = `${esc(t.formattedTime)} <span style="font-size: 0.8rem; color: var(--accent-danger);">(+${t.penaltyMin}m)</span>`;
        if (timeTd && timeTd.innerHTML !== timeHtml) timeTd.innerHTML = timeHtml;

        const hintsTd = tr.querySelector('td[data-field="hints"]');
        if (hintsTd && hintsTd.textContent !== String(t.totalHints)) hintsTd.textContent = t.totalHints;

        const wrongTd = tr.querySelector('td[data-field="wrong"]');
        if (wrongTd && wrongTd.textContent !== String(t.totalWrong)) wrongTd.textContent = t.totalWrong;

        tr.style.background = t.isFinished ? 'var(--accent-success-dim)' : '';
      }
    });
  }

  initLeaderboardShell();
  await loadData();
  lbPollInterval = setInterval(loadData, 2000);
}

// Initial bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initModalsAndDrawers();
  renderApp();
});
