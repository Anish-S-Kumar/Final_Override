# FINAL OVERRIDE — Security Architecture & Policy

Security design and defense-in-depth policies for the **FINAL OVERRIDE** escape room tech challenge.

---

## 1. Threat Model & Operational Context

FINAL OVERRIDE is played by college students and competitive tech squads in a LAN or hosted campus environment. The security posture addresses the following primary vectors:
1. **Direct Database Tampering**: Attempts by players to use browser DevTools, Supabase public client libraries, or PostgREST endpoints to inspect tables, alter state, read answers, or inflate scores.
2. **Credential Leaks**: Accidental exposure of service role keys or database credentials in client bundles, public git history, or documentation.
3. **Impersonation & Replay**: Unauthorized session hijacking or duplicate answer submissions.
4. **Anti-Cheat Evasion**: Tab switching, automated DOM scraping, or client clock tampering.

---

## 2. Row Level Security (RLS) Policy

### 2.1 Complete Table Quarantine
Row Level Security is enabled and **FORCED** on all public tables in PostgreSQL (including `stage2_workbench`, `stage2_workbench_log`, `event_state`):
```sql
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams FORCE ROW LEVEL SECURITY;
```

### 2.2 Deny All Direct Client Access
Every table carries an explicit reject policy for `anon` and `authenticated` roles:
```sql
CREATE POLICY no_anon_access ON public.<table>
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);
```

### 2.3 Privilege Segregation
- **Public & Anon**: Revoked `ALL` on schema `public`. Direct SELECT, INSERT, UPDATE, DELETE operations return zero rows or throw 403 Forbidden.
- **Service Role**: Only the trusted backend Node.js Express server connects using the `service_role` secret or direct PostgreSQL connection string. The server executes business logic, validates inputs, and calls stored procedures.

---

## 3. Function & Stored Procedure Hardening

All PL/pgSQL stored procedures adhere to strict execution standards:

1. **`SECURITY DEFINER`**: Functions run with the privileges of the database owner rather than the calling role, ensuring controlled access to internal tables.
2. **`SET search_path = ''`**: Prevents Search-Path hijacking attacks where malicious users define custom operators or tables in temporary schemas. All internal table references are explicitly qualified (e.g. `public.teams`).
3. **Execution Rights**:
   ```sql
   REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;
   ```

---

## 4. Content Security Policy & Client Protection

The application enforces a strict Content Security Policy (CSP) header via Helmet middleware on all HTTP responses:
- `default-src 'self'`: Only self-hosted scripts, styles, and assets are permitted.
- `script-src 'self'`: Zero third-party scripts or untrusted CDNs. Inline script tags without nonces are strictly rejected.
- `connect-src 'self'`: Prevents outbound data exfiltration by rogue DOM scripts.
- `frame-ancestors 'none'`: Prevents clickjacking by blocking embedding inside iframes.

---

## 5. Credential & Environment Variable Handling (C1–C7)

1. **Environment Strictness (C1)**:
   - Canonical variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (alias: `SUPABASE_SERVICE_ROLE_KEY`), `DATABASE_URL` (optional), `ADMIN_PIN`, `EVENT_SALT`, `SHARD_SECRET`, `COORDINATORS`, `COORDINATOR_PINS`.
   - Never hardcode or default secret keys in source files.
2. **Git Ignore Verification (C4)**:
   - `server/config.js` executes `git check-ignore -q .env` at startup. If `.env` is tracked by git, the server issues a loud security warning and halts in production.
3. **Prohibited Default PINs (C7)**:
   - `server/config.js` validates all administrator and coordinator PINs. The server terminates immediately if known default credentials (`INVICTORS`, `INVICTORS@23`, `INVICTORS2026`) are detected.
4. **No Secrets in Client Artifacts**:
   - The frontend never receives database URLs, service role keys, or answers. All communication flows through the `/api` HTTP and WebSocket endpoints with bearer session tokens.

---

## 5. Security Audit Verification

Administrators can audit the database at any time by executing `supabase/verify_security.sql` in the Supabase SQL Editor or running:
```bash
npm run db:check
```
The check verifies:
- All 16 public tables have `rls_enabled = true` and `rls_forced = true`.
- All 22 stored procedures have `is_security_definer = true` and `search_path` set.
- 0 table permissions are granted to `PUBLIC`, `anon`, or `authenticated`.
