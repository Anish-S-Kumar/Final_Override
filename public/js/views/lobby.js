// FINAL OVERRIDE — Lobby & Onboarding Views (ES Module)

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setText(elementOrId, text) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (el) {
    el.textContent = text !== null && text !== undefined ? String(text) : '';
  }
}

export function renderWaitingLobby(container, state, controller) {
  const team = state.team;
  const members = state.members || [];
  const memberListHtml = members.map(m => `
    <li class="lobby-member-row">
      <span class="member-name-block">
        <svg class="ui-icon" width="14" height="14"><use href="${m.isLeader ? '#icon-users' : '#icon-users'}"></use></svg>
        <strong>${esc(m.fullName)}</strong>
      </span>
      <span class="member-role-badge ${m.isLeader ? 'leader' : ''}">${m.isLeader ? 'Squad Leader' : 'Operative'}</span>
    </li>
  `).join('');

  container.innerHTML = `
    <div class="card lobby-card">
      <div class="lobby-status-indicator">STANDBY MODE</div>
      <h2 class="lobby-title">MISSION BRIEFING LOBBY</h2>
      <p class="lobby-subtitle">
        Department of Computer Science &amp; Engineering &middot; Invictors Club
      </p>

      <div class="lobby-intel-box">
        <div class="lobby-intel-header">
          <div>
            <span class="intel-label">TEAM IDENTIFIER</span>
            <div class="intel-val-team">${esc(team.name)}</div>
          </div>
          <div style="text-align: right;">
            <span class="intel-label">SUPERVISING COORDINATOR</span>
            <div class="intel-val-coord">${esc(team.coordinator)}</div>
          </div>
        </div>

        <div class="operatives-heading">Registered Squad Operatives:</div>
        <ul class="lobby-members-list">
          ${memberListHtml}
        </ul>
      </div>

      <div class="lobby-launch-banner">
        <div class="launch-notice-text">
          Stand by. Awaiting global launch command from Event Control Desk...
        </div>
        <p class="launch-notice-sub">
          All squads begin synchronously upon master clock release. Keep this console active.
        </p>
      </div>

      <div class="lobby-count-text">
        Active squads in staging area: <strong class="lobby-count-num">${state.waitingCount || 1}</strong>
      </div>
    </div>
  `;

  if (controller.startLobbyPolling) {
    controller.startLobbyPolling();
  }
}

export async function renderStartScreen(container, controller) {
  container.innerHTML = `
    <!-- The 6 Stages Showcase Card (Official Specification) -->
    <div class="card poster-stages-section">
      <div class="poster-stages-heading">THE 6 STAGES OF OVERRIDE</div>
      <div class="poster-stages-grid">
        <div class="stage-poster-card s1">
          <div class="stage-badge-num">1</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-signal"></use></svg>
          <div class="stage-poster-title">Signal Intercept</div>
          <div class="stage-poster-desc">Decode 4-sector Morse telemetry and matrix frequencies</div>
        </div>
        <div class="stage-poster-card s2">
          <div class="stage-badge-num">2</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-lock"></use></svg>
          <div class="stage-poster-title">Decoding</div>
          <div class="stage-poster-desc">Unwrap 3 layers of encrypted ciphers</div>
        </div>
        <div class="stage-poster-card s3">
          <div class="stage-badge-num">3</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-terminal"></use></svg>
          <div class="stage-poster-title">Prompt WARDEN</div>
          <div class="stage-poster-desc">Bypass WARDEN AI security protocols</div>
        </div>
        <div class="stage-poster-card s4">
          <div class="stage-badge-num">4</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-flag"></use></svg>
          <div class="stage-poster-title">CTF Flags</div>
          <div class="stage-poster-desc">Hunt terminal tokens &amp; inspect web metadata</div>
        </div>
        <div class="stage-poster-card s5">
          <div class="stage-badge-num">5</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-users"></use></svg>
          <div class="stage-poster-title">Team Sync</div>
          <div class="stage-poster-desc">Link squad devices &amp; reveal HMAC shards</div>
        </div>
        <div class="stage-poster-card s6">
          <div class="stage-badge-num">6</div>
          <svg class="ui-icon" width="24" height="24"><use href="#icon-lock"></use></svg>
          <div class="stage-poster-title">Final Integration</div>
          <div class="stage-poster-desc">Synthesize all 5 fragments for master clearance</div>
        </div>
      </div>
    </div>

    <!-- Story Card -->
    <div class="card">
      <h2 class="card-title">Mission Briefing &amp; Background</h2>
      <p style="font-size: 1.02rem; line-height: 1.7; color: var(--text-secondary);">
        The primary research vault of the Invictors Lab has entered lockdown mode following a critical system fault. A deterministic security subsystem (WARDEN) shields the master override interface. Your squad is designated as the primary emergency penetration team. Traverse all six security tiers, extract cryptographic fragments, verify synchronization across squad devices, and deploy the master override code to restore systems.
      </p>
    </div>

    <!-- How to play Card -->
    <div class="card">
      <h2 class="card-title">Operational Rules &amp; Protocols</h2>
      <ul class="rules-list">
        <li><strong>[1] Sequential Progression:</strong> Stages unlock in strict numerical sequence upon correct fragment verification.</li>
        <li><strong>[2] Intelligence Dossier:</strong> Validated fragments are securely logged in your squad dossier for final synthesis.</li>
        <li><strong>[3] Strategic Clues:</strong> Hint 1 incurs +3m penalty; Hint 2 incurs +5m penalty.</li>
        <li><strong>[4] Submission Limits:</strong> First 5 incorrect attempts carry zero penalty. Subsequent failures incur +1m each.</li>
        <li><strong>[5] Squad Synchronization:</strong> Stage 5 mandates all squad members (3 or 4 operatives) verify their assigned hardware shards individually.</li>
        <li><strong>[6] Anti-Tamper Enforcement:</strong> Switching active tabs outside of designated sandbox zones triggers automatic audit penalties.</li>
      </ul>
    </div>

    <!-- Register Team Form (3 or 4 players) -->
    <div class="card">
      <h2 class="card-title">Squad Registration (3 or 4 Operatives)</h2>
      <form id="team-register-form">
        <div class="form-group">
          <label for="reg-team-name">Squad Identifier / Name (max 24 characters) *</label>
          <input type="text" id="reg-team-name" class="input-control" maxlength="24" placeholder="e.g. CyberKnights" required />
        </div>
        <div class="form-group">
          <label for="reg-coordinator">Assigned Event Coordinator *</label>
          <input type="text" id="reg-coordinator" class="input-control" placeholder="Enter assigned coordinator name" required />
        </div>
        <div class="form-group">
          <label for="reg-m1">Player 1: Squad Leader (This Primary Terminal) *</label>
          <input type="text" id="reg-m1" class="input-control" placeholder="Full name of leader" required />
        </div>
        <div class="form-group">
          <label for="reg-m2">Player 2: Squad Operative *</label>
          <input type="text" id="reg-m2" class="input-control" placeholder="Full name of operative 2" required />
        </div>
        <div class="form-group">
          <label for="reg-m3">Player 3: Squad Operative *</label>
          <input type="text" id="reg-m3" class="input-control" placeholder="Full name of operative 3" required />
        </div>
        <div class="form-group">
          <label for="reg-m4">Member 4 full name (optional)</label>
          <input type="text" id="reg-m4" class="input-control" placeholder="Full name of operative 4 (optional)" />
        </div>
        <div id="reg-error" class="feedback-line error"></div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px; font-size: 1.05rem;">
          Register Squad &amp; Enter Staging
        </button>
      </form>
    </div>

    <!-- Leader Recovery Form -->
    <div class="card leader-recovery-card">
      <h2 class="card-title" style="color: var(--accent-warning);">Resume Mission as Squad Leader</h2>
      <p style="margin-bottom: 14px; font-size: 0.95rem; color: var(--text-muted);">
        If your browser storage was cleared or hardware failed, request your 6-digit one-time leader recovery token from the Event Control Desk.
      </p>
      <form id="leader-recovery-form">
        <div class="form-group">
          <label for="rec-team-name">Registered Squad Identifier *</label>
          <input type="text" id="rec-team-name" class="input-control" placeholder="e.g. CyberKnights" required />
        </div>
        <div class="form-group">
          <label for="rec-code">6-Digit Recovery Token *</label>
          <input type="text" id="rec-code" class="input-control" maxlength="6" placeholder="e.g. 842109" style="font-family: var(--font-mono); letter-spacing: 3px;" required />
        </div>
        <div id="rec-error" class="feedback-line error"></div>
        <button type="submit" class="btn btn-outline" style="width: 100%; margin-top: 10px; border-color: var(--accent-warning); color: var(--accent-warning);">
          Authenticate &amp; Restore Session
        </button>
      </form>
    </div>

    <!-- Member Join Form -->
    <div class="card">
      <h2 class="card-title">Squad Member Hardware Terminal</h2>
      <p style="margin-bottom: 14px; font-size: 0.95rem; color: var(--text-muted);">
        Operatives accessing from their auxiliary devices: enter your squad name and registered name to access your Stage 5 cryptographic shard.
      </p>
      <form id="member-join-form">
        <div class="form-group">
          <label for="join-team-name">Squad Identifier *</label>
          <input type="text" id="join-team-name" class="input-control" placeholder="Squad identifier" required />
        </div>
        <div class="form-group">
          <label for="join-member-name">Operative Full Name *</label>
          <input type="text" id="join-member-name" class="input-control" placeholder="Your full name as registered" required />
        </div>
        <div id="join-error" class="feedback-line error"></div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
          Access Operative Shard
        </button>
      </form>
      <div id="shard-result-container" style="display: none; margin-top: 20px;"></div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('team-register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('reg-error');
    errorEl.textContent = '';

    const m4Raw = document.getElementById('reg-m4')?.value || '';
    const m4Trimmed = m4Raw.trim();

    const payload = {
      teamName: document.getElementById('reg-team-name').value.trim(),
      coordinator: document.getElementById('reg-coordinator').value.trim(),
      member1: document.getElementById('reg-m1').value.trim(),
      member2: document.getElementById('reg-m2').value.trim(),
      member3: document.getElementById('reg-m3').value.trim()
    };
    if (m4Trimmed) {
      payload.member4 = m4Trimmed;
    } else {
      payload.member4 = null;
    }

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Registration failed.';
      } else {
        controller.renderApp();
      }
    } catch {
      errorEl.textContent = 'Server connection error. Please try again.';
    }
  });

  document.getElementById('leader-recovery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('rec-error');
    errorEl.textContent = '';

    const teamName = document.getElementById('rec-team-name').value.trim();
    const code = document.getElementById('rec-code').value.trim();

    try {
      const res = await fetch('/api/recover-leader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName, code })
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Failed to recover session.';
      } else {
        controller.showToast(`Session restored for squad: ${data.teamName}`);
        controller.renderApp();
      }
    } catch {
      errorEl.textContent = 'Network error while attempting recovery.';
    }
  });

  document.getElementById('member-join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('join-error');
    const resultBox = document.getElementById('shard-result-container');
    errorEl.textContent = '';
    resultBox.style.display = 'none';

    const teamName = document.getElementById('join-team-name').value.trim();
    const fullName = document.getElementById('join-member-name').value.trim();

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName, fullName })
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Failed to retrieve shard.';
      } else {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div class="member-shard-result-card">
            <div class="shard-result-label">ASSIGNED OPERATIVE SHARD</div>
            <div class="shard-result-operative">${esc(data.name)} &middot; ${esc(data.team)}</div>
            <div class="shard-result-value tabular-nums">${esc(data.shard)}</div>
            <p class="shard-result-instruction">
              Relay this cryptographic shard to your Squad Leader for Stage 5 Final Override synthesis.
            </p>
          </div>
        `;
      }
    } catch {
      errorEl.textContent = 'Server connection error. Please try again.';
    }
  });
}
