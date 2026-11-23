# FINAL OVERRIDE — Git History Audit & Secret Sanitation Plan

**Date:** 2026-11-21  
**Status:** Audit Complete / Remediation Guidelines Provided  
**Notice:** In accordance with Ground Rules, history rewriting and force-pushing have **NOT** been performed. This document details findings and the protocol for the repository owner.

---

## 1. Historical Commit Findings

Our forensic scan revealed historical commits where default fallback credentials, legacy admin PINs, and development salts were recorded in git history:

| Commit Hash | Author | Date | Findings (Masked) |
| :--- | :--- | :--- | :--- |
| `e73ef84` | Anish-S-Kumar | 2026-11-20 | Literal default PIN: `INVI***S@23`<br>Legacy event salt: `invi***2026`<br>Legacy Vercel serverless configurations |
| `e0a62f7` | Anish-S-Kumar | 2026-11-20 | Initial repo tree containing default fallback secrets in `server/config.js` |

> [!WARNING]
> **Removing secrets from current working files does NOT purge them from Git history.**
> Any collaborator with clone access can inspect `git log` or `git show` to recover historical commits. Furthermore, if credentials belonged to external services (e.g. Supabase, Vercel, API providers), only the service account owner can revoke or rotate them at the provider level.

---

## 2. Step-by-Step History Cleaning Plan (`git-filter-repo`)

To permanently erase historical secret strings and files from the Git object database, execute the following steps locally on an isolated, verified backup:

### Step 1: Pre-Flight Safety Backup
```bash
# Clone a fresh mirror backup to an external drive or non-synced folder
git clone --mirror c:\Users\lenovo\OneDrive\Desktop\Invictors-main C:\Users\lenovo\final_override_mirror_backup.git
```

### Step 2: Install `git-filter-repo`
Install the official Python-based filter utility:
```bash
pip install git-filter-repo
```

### Step 3: Define Replacement Expressions
Create a text file named `expressions.txt`:
```text
INVICTORS@23==>REDACTED_HISTORICAL_PIN
invictors_final_override_salt_2026==>REDACTED_HISTORICAL_SALT
```

### Step 4: Execute History Scrubbing
```bash
git filter-repo --replace-text expressions.txt
```

### Step 5: Scrub Tracked Insecure Files
If past PDF guides, `.env` files, or obsolete schemas need eradication:
```bash
git filter-repo --invert-paths --path FINAL_OVERRIDE_ADMIN_GUIDE.pdf --path server/supabase_schema.sql
```

### Step 6: Coordination with Collaborators
- Rewriting Git history modifies all subsequent commit hashes.
- Collaborators must delete their existing local checkouts and clone fresh copies after history rewriting.
- **Never force-push (`git push --force`) without explicit team coordination.**

---

## 3. Mandatory Provider Revocation Checklist

1. **Supabase Secret Key**: The owner must verify that the new project (`vdqmugtolspszcjtiloa`) is used and that any key shared in communication is rotated in the Supabase Dashboard (`Project Settings > API > Service Role Secret > Rotate`).
2. **Admin PIN**: Must be defined uniquely in `.env` (min 8 characters). The application now explicitly refuses to start if `ADMIN_PIN` equals `INVICTORS@23` or `INVICTORS`.
