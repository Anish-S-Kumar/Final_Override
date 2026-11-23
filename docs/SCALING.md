# FINAL OVERRIDE — Scaling & Multi-Node Architecture Guide

This document outlines the migration path for scaling **FINAL OVERRIDE** from a single LAN server to a distributed, multi-instance cloud cluster capable of supporting thousands of simultaneous teams across campuses.

---

## 1. Modular Architecture Overview

FINAL OVERRIDE's codebase is designed with clean interface boundaries to ensure zero vendor lock-in and seamless component swapping:

```
┌─────────────────────────────────────────────────────────────┐
│                       Express Routers                       │
│    (/api/submit, /api/state, /api/hints, /api/coordinator)  │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
     ┌─────────▼─────────┐          ┌─────────▼─────────┐
     │    LockService    │          │    QueryCache     │
     │  (In-Memory Map)  │          │  (In-Memory TTL)  │
     └─────────┬─────────┘          └─────────┬─────────┘
               │                              │
               └──────────────┬───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ DataService Proxy │
                    └─────────┬─────────┘
                              │
               ┌──────────────┴───────────────┐
               ▼                              ▼
     ┌───────────────────┐          ┌───────────────────┐
     │ SQLite Repository │          │ Supabase / Cloud  │
     │   (Local WAL)     │          │ (PostgreSQL stub) │
     └───────────────────┘          └───────────────────┘
```

---

## 2. Component Migration Matrix

| Subsystem | Single-Server LAN (Current) | Multi-Node Cluster (Scaled) | Migration Steps |
| :--- | :--- | :--- | :--- |
| **Data Repository** | `sqliteRepository.js` (better-sqlite3 / node:sqlite) | `supabaseStub.js` / PostgreSQL | Set `DATABASE_ENGINE=postgres` or configure Supabase credentials. Schema is 100% compatible via `001_initial_schema.sql`. |
| **Concurrency Lock** | `lockService.js` (per-team promise chain) | Redis Distributed Lock (Redlock) | Swap `withLock(teamId, fn)` to acquire a key `lock:team:${teamId}` in Redis with automatic TTL expiration. |
| **Micro-Cache** | `queryCache.js` (in-memory `Map`) | Redis Key-Value Store | Delegate `get(k)` and `set(k, v, ttl)` to `redis.get()` and `redis.set(k, v, 'EX', 2)`. |
| **Load Shedder** | `loadShedder.js` (Node perf_hooks) | Reverse Proxy / Ingress (e.g. NGINX, Traefik) | Configure rate limiting and circuit breaking at the ingress level (`max_reqs_per_sec`, 503 error handling). |
| **Live Updates** | HTTP 5s Polling (`ETag` / `If-None-Match`) | Redis Pub/Sub + WebSockets | Connect Express WebSocket (`ws`) clients to Redis PubSub channels (`channel:team:${teamId}`). |

---

## 3. Implementing the Redis Lock Adapter

To run multiple Node.js worker processes behind a load balancer, replace `server/services/lockService.js` with a Redis client:

```javascript
// Example: server/services/redisLockService.js
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async function withLock(teamId, fn, ttlMs = 5000) {
  const lockKey = `lock:team:${teamId}`;
  const identifier = Math.random().toString(36).slice(2);
  
  // Acquire lock
  const acquired = await redis.set(lockKey, identifier, 'PX', ttlMs, 'NX');
  if (!acquired) {
    // Retry backoff
    await new Promise(r => setTimeout(r, 50));
    return withLock(teamId, fn, ttlMs);
  }

  try {
    return await fn();
  } finally {
    // Release lock safely with Lua script (check value before delete)
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseScript, 1, lockKey, identifier);
  }
}

module.exports = { withLock };
```

---

## 4. Database Scaling & Read Replicas

Because 95% of game requests are read operations (`GET /api/state`, `GET /api/leaderboard`):
1. **Primary Database (Writes)**:
   - Dedicated PostgreSQL / Cloud SQL instance handling `POST /api/teams`, `POST /api/submit`, `POST /api/hint`.
2. **Read Pool (Reads)**:
   - Route `getTeamById`, `getProgress`, `getMembers`, and `getWaitingTeamsCount` through read replicas with 2-second caching to effortlessly handle 10,000+ players.
