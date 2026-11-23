// FINAL OVERRIDE — Centralized Client API Service (ES Module)
// Handles bearer authentication, idempotency tokens, timeouts, and structured error responses.

const DEFAULT_TIMEOUT_MS = 10000;

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

export function getToken() {
  try {
    return localStorage.getItem('fo_session_token') || null;
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem('fo_session_token', token);
    } else {
      localStorage.removeItem('fo_session_token');
    }
  } catch {}
}

export async function apiRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...options.headers };

  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  // Idempotency token on mutations
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  } else if ((method === 'POST' || method === 'PUT') && options.useIdempotency !== false) {
    headers['Idempotency-Key'] = generateUUID();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      ...options,
      method,
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      etag: res.headers.get('ETag') || null
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, status: 408, data: { error: 'Request timed out. Please check your network connection.' } };
    }
    return { ok: false, status: 0, data: { error: err.message || 'Network communication error.' } };
  }
}

export const api = {
  // Game Play
  getState(version) {
    const headers = {};
    if (version) headers['If-None-Match'] = version;
    return apiRequest('/api/state', { method: 'GET', headers });
  },

  submitAnswer(answer, idempotencyKey) {
    return apiRequest('/api/submit', {
      method: 'POST',
      body: { answer },
      idempotencyKey
    });
  },

  requestHint(idempotencyKey) {
    return apiRequest('/api/hint', {
      method: 'POST',
      body: {},
      idempotencyKey
    });
  },

  joinMember(teamName, memberName, deviceToken) {
    return apiRequest('/api/join', {
      method: 'POST',
      body: { teamName, memberName, deviceToken }
    });
  },

  recordTabPenalty(stage, details) {
    return apiRequest('/api/tab-penalty', {
      method: 'POST',
      body: { stage, details }
    });
  },

  execTerminal(command) {
    return apiRequest('/api/terminal/exec', {
      method: 'POST',
      body: { command }
    });
  },

  chatWarden(message) {
    return apiRequest('/api/warden/chat', {
      method: 'POST',
      body: { message }
    });
  },

  // Public Leaderboard
  getLeaderboard() {
    return apiRequest('/api/leaderboard', { method: 'GET' });
  },

  // Auth & Management
  loginCoordinator(name, pin) {
    return apiRequest('/api/coordinator/login', {
      method: 'POST',
      body: { name, pin }
    });
  },

  loginAdmin(pin) {
    return apiRequest('/api/admin/login', {
      method: 'POST',
      body: { pin }
    });
  }
};
