---
name: deploy
description: Deploy a 0pflow app to DBOS Cloud. Verifies deployment files, sets up environment, and deploys.
---

# Deploy to DBOS Cloud

Deploys a Next.js + 0pflow workflow app to DBOS Cloud.

**Announce at start:** "I'm using the deploy skill to prepare and deploy this app to DBOS Cloud."

---

## Pre-Flight Checks

1. **Verify this is a 0pflow app:**
   - `package.json` must exist with `0pflow` as a dependency
   - `generated/workflows/` should exist with at least one compiled workflow

2. **Check DBOS Cloud CLI:**
   - Run `npx dbos-cloud --version` to verify availability
   - If not installed: `npm install -g @dbos-inc/dbos-cloud@latest`

3. **Verify deployment files exist (shipped with template):**
   - `src/lib/pflow.ts` — singleton with auto-discovery
   - `src/instrumentation.ts` — eager initialization at startup
   - `src/app/api/workflow/[name]/route.ts` — dynamic workflow API route
   - `dbos-config.yaml` — DBOS Cloud config
   - If any are missing, inform the user they can be restored by copying from the 0pflow app template

4. **Verify `dbos-config.yaml` name matches the app:**
   - The `name` field should match the project name
   - If it still has the template placeholder `{{app_name}}`, replace it with the actual app name from `package.json`

---

## Phase 1: Generate Lockfile

DBOS Cloud uses bun for faster installs. Generate a bun lockfile:

```bash
bun install
```

This creates `bun.lock` which DBOS Cloud prefers over `package-lock.json`.

- If bun is not installed: `npm install -g bun`
- If `bun.lock` already exists, run `bun install` again to refresh it

---

## Phase 2: Link Database (BYOD — first-time only)

0pflow apps use Tiger Cloud as their database. DBOS Cloud connects to it via **Bring Your Own Database (BYOD)**.

The `setup_app_schema` tool automatically creates a `dbosadmin` role on the database and writes `DBOS_ADMIN_URL` to `.env`. If `DBOS_ADMIN_URL` is not in `.env`, the dbosadmin role may not exist yet — re-run `setup_app_schema` or create it manually:

```sql
CREATE ROLE dbosadmin WITH LOGIN CREATEDB PASSWORD '<password>';
```

### Link the database to DBOS Cloud

1. **Extract hostname and port from `DATABASE_URL`:**
   - Parse the `DATABASE_URL` from `.env` to get the hostname and port

2. **Link:**
   ```bash
   npx dbos-cloud db link <database-instance-name> -H <hostname> -p <port>
   ```
   - `<database-instance-name>` must be 3-16 chars, lowercase alphanumeric + underscores
   - When prompted for the password, use the password from `DBOS_ADMIN_URL` in `.env`

3. **Verify:**
   ```bash
   npx dbos-cloud db list
   ```
   - The linked database should appear in the list

Skip this phase if `npx dbos-cloud db list` already shows the database.

---

## Phase 3: Deploy

### First-time Deployment

1. **Login to DBOS Cloud:**
   ```bash
   npx dbos-cloud login
   ```

2. **Import environment variables:**
   ```bash
   npx dbos-cloud app env import -d .env
   ```
   - Review `.env` before importing — ensure it doesn't contain local-only values
   - Do NOT import `DBOS_ADMIN_URL` — it's only for setup, not the app runtime

3. **Deploy:**
   ```bash
   npx dbos-cloud app deploy -d <database-instance-name>
   ```
   - Use the same database instance name from the `db link` step

### Subsequent Deployments

```bash
npx dbos-cloud app deploy
```

No need to re-import env variables or specify database on subsequent deploys.

---

## Phase 4: Verify Deployment

After deployment completes:

1. **Check app status:**
   ```bash
   npx dbos-cloud app status
   ```
   - Should show status as `AVAILABLE`

2. **Check logs if issues:**
   ```bash
   npx dbos-cloud app logs
   ```

3. **Test a workflow endpoint:**
   - Use the URL from `app status` output
   - `curl <app-url>/api/workflow/<workflow-name>`

---

## Troubleshooting

### App shows UNAVAILABLE status

Check logs with `npx dbos-cloud app logs`. Common causes:
- Missing environment variables
- DBOS not initializing at startup (missing `instrumentation.ts`)
- Database connection issues

### "Application taking too long to become available"

DBOS Cloud has a startup timeout. Verify:
1. `src/instrumentation.ts` exists and calls `getPflow()`
2. `DATABASE_URL` is correct and accessible from DBOS Cloud
3. No errors during DBOS initialization

### Build fails with lockfile errors

Regenerate lockfiles:
```bash
rm -rf bun.lock package-lock.json
bun install
```

---

## Environment Variables Reference

**Required for deployment:**
- `DATABASE_URL` — Application database connection string
- `OPENAI_API_KEY` — If using AI agents
- Any other secrets your workflows need (API tokens, etc.)

**Setup only (do not import to DBOS Cloud):**
- `DBOS_ADMIN_URL` — Connection string for the `dbosadmin` role, used for `dbos-cloud db link`

**Not needed when deployed (DBOS Cloud provides them):**
- `DBOS_CONDUCTOR_KEY` — Only for local development with `npx dbos start`
- `DBOS_SYSTEM_DATABASE_URL` — Provided automatically by DBOS Cloud

---

## Useful Commands

```bash
# Check app status
npx dbos-cloud app status

# View logs
npx dbos-cloud app logs

# List database instances
npx dbos-cloud db list

# Update environment variables
npx dbos-cloud app env import -d .env
```
