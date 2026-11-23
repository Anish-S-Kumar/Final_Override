// FINAL OVERRIDE — In-Process Real-time Event Bus
// Emits state updates, stage unlocks, hints, and system pauses.
// Provides hooks for future Server-Sent Events (SSE) or WebSockets without coupling.
const EventEmitter = require('events');

class GameEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  notifyTeamUpdate(teamId, eventType, data = {}) {
    this.emit('team:update', { teamId, eventType, data, timestamp: Date.now() });
    this.emit(`team:${teamId}`, { eventType, data, timestamp: Date.now() });
  }

  notifyGlobalUpdate(eventType, data = {}) {
    this.emit('global:update', { eventType, data, timestamp: Date.now() });
  }
}

module.exports = new GameEventBus();
