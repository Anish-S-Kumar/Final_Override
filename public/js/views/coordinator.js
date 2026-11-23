// FINAL OVERRIDE — Coordinator View (ES Module)
import { esc } from './lobby.js';

let coordPollInterval = null;

export async function renderCoordinatorView(container, controller) {
  if (coordPollInterval) clearInterval(coordPollInterval);

  const coordName = sessionStorage.getItem('fo_coord_name');
  const coordPin = sessionStorage.getItem('fo_coord_pin');

  if (!coordName || !coordPin) {
    let coordinators = [];
    try {
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.coordinators) coordinators = cfg.coordinators;
      }
    } catch { }

    const options = coordinators.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    container.innerHTML = `
      <div class="card page-enter" style="max-width: 480px; margin: 40px auto; text-align: center;">
        <h2 style="color: var(--accent-warning); margin-bottom: 8px;">Coordinator Authentication</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 24px;">Select your assigned identifier and enter your security PIN.</p>

        <form id="coord-login-form">
          <div class="form-group" style="text-align: left;">
            <label for="coord-name-select" style="font-weight: bold; color: var(--text-primary);">Assigned Coordinator</label>
            <select id="coord-name-select" class="input-control" required>
              <option value="">-- Select Assigned Coordinator --</option>
              ${options}
            </select>
          </div>

          <div class="form-group" style="text-align: left;">
            <label for="coord-pin-input" style="font-weight: bold; color: var(--text-primary);">Security PIN</label>
            <input type="password" id="coord-pin-input" class="input-control" placeholder="Security PIN" maxlength="12" required />
          </div>

          <div id="coord-login-error" class="feedback-line error" style="margin-bottom: 12px;"></div>

          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px;">Authenticate &amp; Access</button>
        </form>
      </div>
    `;

    document.getElementById('coord-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('coord-name-select').value;
      const pin = document.getElementById('coord-pin-input').value.trim();
      const errBox = document.getElementById('coord-login-error');

      try {
        const res = await fetch('/api/coordinator/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, pin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('fo_coord_name', name);
          sessionStorage.setItem('fo_coord_pin', pin);
          renderCoordinatorView(container, controller);
        } else {
          errBox.textContent = data.error || 'Authentication rejected.';
        }
      } catch {
        errBox.textContent = 'Server connection error.';
      }
    });

    return;
  }

  // Logged-in coordinator view
  async function loadData() {
    try {
      const res = await fetch(`/api/coordinator/overview?name=${encodeURIComponent(coordName)}&pin=${encodeURIComponent(coordPin)}`);
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('fo_coord_name');
        sessionStorage.removeItem('fo_coord_pin');
        renderCoordinatorView(container, controller);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      updateDashboard(data);
    } catch (err) {
      console.error('Coordinator fetch error:', err);
    }
  }

  function initDashboardShell() {
    container.innerHTML = `
      <div id="coord-dashboard-card" class="card page-enter">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Coordinator Portal</span>
            <h2 style="font-size: 1.4rem; color: var(--accent-primary); margin: 2px 0 0;">Sector Supervisor: ${esc(coordName)}</h2>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-coord-refresh" class="btn btn-sm btn-outline">Refresh Data</button>
            <button id="btn-coord-logout" class="btn btn-sm btn-outline" style="border-color: var(--accent-danger); color: var(--accent-danger);">Logout</button>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.92rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-subtle); color: var(--text-muted); text-transform: uppercase; font-size: 0.78rem;">
                <th style="padding: 10px;">Squad Identifier</th>
                <th style="padding: 10px;">Registered Operatives</th>
                <th style="padding: 10px;">Mission Stage</th>
                <th style="padding: 10px;">Elapsed / Penalty</th>
                <th style="padding: 10px;">Integrity Violations</th>
                <th style="padding: 10px;">Verification Hash</th>
              </tr>
            </thead>
            <tbody id="coord-teams-tbody">
              <tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">Retrieving assigned squads...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-coord-refresh')?.addEventListener('click', loadData);
    document.getElementById('btn-coord-logout')?.addEventListener('click', () => {
      sessionStorage.removeItem('fo_coord_name');
      sessionStorage.removeItem('fo_coord_pin');
      if (coordPollInterval) clearInterval(coordPollInterval);
      renderCoordinatorView(container, controller);
    });
  }

  function updateDashboard(data) {
    let tbody = document.getElementById('coord-teams-tbody');
    if (!tbody) {
      initDashboardShell();
      tbody = document.getElementById('coord-teams-tbody');
    }

    const teams = data.teams || [];
    if (teams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">No squads currently assigned under this coordinator identifier.</td></tr>`;
      return;
    }

    // Keyed row updates to avoid table flash
    const teamIds = new Set(teams.map(t => t.id));

    // Remove rows for teams no longer present
    Array.from(tbody.querySelectorAll('tr[data-team-id]')).forEach(tr => {
      const id = tr.getAttribute('data-team-id');
      if (!teamIds.has(id)) tr.remove();
    });

    // Remove loading or empty placeholder row if present
    const placeholder = tbody.querySelector('td[colspan="6"]');
    if (placeholder) placeholder.parentElement.remove();

    teams.forEach(t => {
      let tr = tbody.querySelector(`tr[data-team-id="${t.id}"]`);
      const isCompleted = t.isFinished || t.stageNumber >= 6;
      const stageColor = isCompleted ? 'var(--accent-success)' : 'var(--accent-primary)';
      const violationColor = t.tabSwitches > 0 ? 'var(--accent-danger)' : 'var(--text-muted)';
      const stageDisplay = isCompleted ? 'COMPLETED' : `Stage ${t.stageNumber || t.stage || 1} / 5`;

      if (!tr) {
        tr = document.createElement('tr');
        tr.setAttribute('data-team-id', t.id);
        tr.style.borderBottom = '1px solid var(--border-subtle)';
        tr.innerHTML = `
          <td data-field="name" style="padding: 10px; font-weight: bold; color: var(--text-primary);">${esc(t.name)}</td>
          <td data-field="players" style="padding: 10px; font-size: 0.88rem; color: var(--text-secondary);">${(t.players || []).map(p => esc(p)).join(', ')}</td>
          <td data-field="stage" style="padding: 10px; font-weight: bold; color: ${stageColor};">${esc(stageDisplay)}</td>
          <td data-field="time" class="tabular-nums" style="padding: 10px; font-family: var(--font-mono);">${esc(t.formattedTime)} <span style="color: var(--accent-danger); font-size: 0.82rem;">(+${t.penaltyMin}m)</span></td>
          <td data-field="violations" style="padding: 10px; font-size: 0.85rem; color: ${violationColor};">${t.tabSwitches} switches</td>
          <td data-field="code" style="padding: 10px; font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-warning);">${esc(t.verificationCode || '-')}</td>
        `;
        tbody.appendChild(tr);
      } else {
        // Patch only changed fields
        const stageTd = tr.querySelector('td[data-field="stage"]');
        if (stageTd && stageTd.textContent !== stageDisplay) {
          stageTd.textContent = stageDisplay;
          stageTd.style.color = stageColor;
        }

        const timeTd = tr.querySelector('td[data-field="time"]');
        const timeHtml = `${esc(t.formattedTime)} <span style="color: var(--accent-danger); font-size: 0.82rem;">(+${t.penaltyMin}m)</span>`;
        if (timeTd && timeTd.innerHTML !== timeHtml) {
          timeTd.innerHTML = timeHtml;
        }

        const violTd = tr.querySelector('td[data-field="violations"]');
        const violText = `${t.tabSwitches} switches`;
        if (violTd && violTd.textContent !== violText) {
          violTd.textContent = violText;
          violTd.style.color = violationColor;
        }

        const codeTd = tr.querySelector('td[data-field="code"]');
        if (codeTd && codeTd.textContent !== (t.verificationCode || '-')) {
          codeTd.textContent = t.verificationCode || '-';
        }
      }
    });
  }

  initDashboardShell();
  await loadData();
  coordPollInterval = setInterval(loadData, 5000);
}
