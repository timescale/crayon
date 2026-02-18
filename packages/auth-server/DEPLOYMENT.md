# Deployment Proxy — White-Labeled DBOS Cloud

The auth-server acts as a deployment proxy for DBOS Cloud. Users interact only with `0pflow deploy` — the auth-server manages a single platform DBOS Cloud account and proxies all operations. The DBOS Cloud token never leaves the server.

## Architecture

```
0pflow CLI / Dev UI
  │
  ├─ POST /api/deploy/prepare   (link DB, register app, set secrets)
  ├─ POST /api/deploy/upload    (forward ZIP archive to DBOS Cloud)
  └─ GET  /api/deploy/status    (proxy app status)
  │
  ▼
Auth Server (this service)
  │
  ├─ Authenticates user via Bearer token
  ├─ Maps user apps to namespaced DBOS Cloud app names
  ├─ Manages platform DBOS Cloud JWT (refresh via Auth0)
  └─ Proxies all DBOS Cloud API calls
  │
  ▼
DBOS Cloud (cloud.dbos.dev)
```

## One-Time Platform Setup

### 1. Create a DBOS Cloud account

```bash
npx dbos-cloud login --get-refresh-token
```

This opens a browser for Auth0 authentication and stores credentials in `.dbos/credentials`.

### 2. Get the refresh token and organization

```bash
cat .dbos/credentials | jq '{refreshToken, organization}'
```

### 3. Configure auth-server environment

Add these to your auth-server environment (Vercel or `.env.local`):

```env
DBOS_CLOUD_REFRESH_TOKEN=<the refreshToken from step 2>
DBOS_CLOUD_ORGANIZATION=<the organization from step 2>
```

### 4. Deploy the auth-server

```bash
cd packages/auth-server
vercel --prod
# or for local dev: pnpm dev
```

## Naming

Both the DBOS Cloud app name and database instance name are derived from the deployment's auto-increment ID:

- Format: `tiger-{deployment_id}`
- Example: deployment #42 → app `tiger-42`, db `tiger-42`

Names are assigned on first deploy and reused on subsequent deploys of the same `(user_id, app_name)` pair. The auto-increment ID guarantees uniqueness with no collision handling needed.

## API Reference

### POST /api/deploy/prepare

Prepares a deployment: links the database (BYOD), registers the app in DBOS Cloud, and sets environment variables as secrets.

**Request:**
```json
{
  "appName": "my-app",
  "databaseHostname": "abc123.us-east-1.tsdb.cloud.timescale.com",
  "databasePort": 5432,
  "databasePassword": "...",
  "envVars": {
    "DATABASE_URL": "postgres://...",
    "OPFLOW_TOKEN": "..."
  }
}
```

**Response:**
```json
{
  "data": {
    "dbosAppName": "u_a1b2c3d4_my_app"
  }
}
```

All DBOS Cloud operations (DB link, app register, secrets) are idempotent. Subsequent calls skip already-completed steps.

### POST /api/deploy/upload

Uploads a deployment archive and forwards it to DBOS Cloud.

**Request:**
```json
{
  "appName": "my-app",
  "archive": "<base64 encoded ZIP>"
}
```

**Response:**
```json
{
  "data": {
    "version": "1"
  }
}
```

### GET /api/deploy/status?appName=X

Returns the current deployment status.

**Response:**
```json
{
  "data": {
    "status": "AVAILABLE",
    "appUrl": "https://org-u_a1b2c3d4_my_app.cloud.dbos.dev",
    "version": "1"
  }
}
```

Status values: `AVAILABLE`, `UNAVAILABLE`, `UNKNOWN`.

### GET /api/deploy/logs?appName=X

Returns application logs from DBOS Cloud.

## Database Schema

The `deployments` table tracks user apps:

```sql
CREATE TABLE deployments (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL REFERENCES users(id),
  app_name TEXT NOT NULL,
  dbos_app_name TEXT NOT NULL UNIQUE,
  dbos_db_name TEXT NOT NULL UNIQUE,
  app_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, app_name)
);
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DBOS_CLOUD_REFRESH_TOKEN` | Yes | Auth0 refresh token for the platform DBOS Cloud account |
| `DBOS_CLOUD_ORGANIZATION` | Yes | DBOS Cloud organization name for the platform account |
| `DATABASE_URL` | Yes | PostgreSQL connection for auth-server tables (users, sessions, deployments) |
| `NANGO_SECRET_KEY` | Yes | Nango secret key for integration management |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret |

## Token Management

The auth-server manages the DBOS Cloud JWT internally:

1. On first API call, refreshes the token via `POST https://login.dbos.dev/oauth/token`
2. Caches the JWT in memory (survives Vercel warm invocations)
3. Checks JWT expiry before each use (60s buffer)
4. Re-refreshes automatically when expired

The platform refresh token (stored in `DBOS_CLOUD_REFRESH_TOKEN`) is long-lived. If it's revoked, re-run the platform setup steps.

## Troubleshooting

### "DBOS_CLOUD_REFRESH_TOKEN not configured"

The auth-server doesn't have the platform DBOS Cloud credentials. Follow the One-Time Platform Setup steps above.

### "Failed to refresh DBOS Cloud token"

The refresh token may have been revoked or expired. Re-run `npx dbos-cloud login --get-refresh-token` and update the env var.

### Upload fails with request too large

The deployment ZIP exceeds Vercel's body size limit (4.5MB free / 50MB Pro). Ensure `node_modules`, `.git`, `.next`, and `dist` are excluded. Check `.dbosignore` for additional exclusions.

### App shows UNAVAILABLE status

Check logs with `GET /api/deploy/logs?appName=X`. Common causes:
- Missing environment variables (especially `DATABASE_URL`)
- DBOS not initializing at startup (check `src/instrumentation.ts`)
- Database connection issues from DBOS Cloud to Tiger Cloud

## Local Development

Set `OPFLOW_SERVER_URL=http://localhost:3000` in the CLI environment to route deploy calls to a local auth-server:

```bash
OPFLOW_SERVER_URL=http://localhost:3000 0pflow deploy
```
