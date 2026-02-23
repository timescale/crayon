# 0pflow Auth Server

Hosted credential proxy that lets users access integrations (Salesforce, HubSpot, etc.) without needing their own Nango account. Authenticates users via GitHub OAuth and proxies Nango API calls. Also handles user app deployments to Fly.io via `flyctl`.

## Setup

### 1. Create a GitHub OAuth App

1. Go to **GitHub Settings > Developer settings > OAuth Apps > New OAuth App**
   - https://github.com/settings/applications/new
2. Fill in:
   - **Application name:** `0pflow` (or whatever you want)
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/github/callback`
3. Click **Register application**
4. Copy the **Client ID**
5. Click **Generate a new client secret** and copy it

> For production, update the Homepage URL and callback URL to `https://opflow-auth.fly.dev`.

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

```env
NANGO_SECRET_KEY=<your Nango secret key>
DATABASE_URL=<PostgreSQL connection string>
GITHUB_CLIENT_ID=<from step 1>
GITHUB_CLIENT_SECRET=<from step 1>
NEXT_PUBLIC_GITHUB_CLIENT_ID=<same Client ID — needed for the browser page>
FLY_API_TOKEN=<Fly.io API token — for managing user app deployments>
FLY_ORG=personal
```

### 3. Set up the database

The auth server needs a PostgreSQL database for users and auth sessions. You can use Tiger Cloud or any PostgreSQL instance. Tables are created automatically on first request.

### 4. Install and run

```bash
pnpm install
pnpm dev
```

The server starts at http://localhost:3000.

## Verify it works

```bash
# 1. Create a CLI auth session
curl -s -X POST http://localhost:3000/api/auth/cli/session | jq
# → { "data": { "code": "abcd1234", "secret": "..." } }

# 2. Open the approval page in browser (use the code from above)
open "http://localhost:3000/auth/cli?cli_code=<code>"
# → Click "Sign in with GitHub" → authorize → see "Authorized!" page

# 3. Poll for the token
curl -s "http://localhost:3000/api/auth/cli/check?code=<code>&secret=<secret>" | jq
# → { "data": { "status": "approved", "token": "..." } }

# 4. Test authenticated endpoints
TOKEN=<token from step 3>
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/integrations | jq
```

## Deploying to Fly.io

The auth server runs on Fly.io so it can invoke `flyctl` for user app deployments.

### First-time setup

```bash
cd packages/auth-server

# Create the Fly app
flyctl apps create opflow-auth

# Set secrets from .env.local
flyctl secrets import -a opflow-auth < .env.local

# Deploy
flyctl deploy
```

### Subsequent deploys

```bash
cd packages/auth-server
flyctl deploy
```

### After deploying

Update your GitHub OAuth App at https://github.com/settings/developers:
- **Homepage URL:** `https://opflow-auth.fly.dev`
- **Authorization callback URL:** `https://opflow-auth.fly.dev/api/auth/github/callback`

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/cli/session` | POST | No | Create CLI auth session |
| `/api/auth/cli/check` | GET | No | Poll session status (`?code=X&secret=Y`) |
| `/auth/cli` | GET | No | Browser approval page (`?cli_code=X`) |
| `/api/auth/github/callback` | GET | No | GitHub OAuth callback |
| `/api/integrations` | GET | Bearer | List Nango integrations |
| `/api/integrations/{id}/connections` | GET | Bearer | List connections for an integration |
| `/api/credentials/{integrationId}` | GET | Bearer | Fetch credentials (`?connection_id=X`) |
| `/api/nango/connect-session` | POST | Bearer | Create Nango Connect session for OAuth setup |
| `/api/deploy/prepare` | POST | Bearer | Create Fly app for deployment |
| `/api/deploy/push` | POST | Bearer | Upload code + kick off Docker build via flyctl |
| `/api/deploy/status` | GET | Bearer | Check build/machine status (`?appName=X`) |
| `/api/deploy/logs` | GET | Bearer | Get build + runtime logs (`?appName=X`) |
| `/api/cloud-dev/create` | POST | Bearer | Create cloud dev Fly app + machine |
| `/api/cloud-dev/status` | GET | Bearer | Check cloud dev machine state (`?appName=X`) |
| `/api/cloud-dev/stop` | POST | Bearer | Stop cloud dev machine |
| `/api/cloud-dev/destroy` | POST | Bearer | Destroy cloud dev machine (owner only) |

## Cloud Dev

Cloud dev machines let users run a full 0pflow dev environment (dev UI + embedded Claude Code terminal) on a Fly.io machine with persistent storage.

### Building the Docker image

The pre-built image lives at `packages/core/docker/`. It bundles Node.js, Claude Code, and 0pflow with pre-cached `node_modules`.

**Development (local build):**

```bash
# Build 0pflow and pack a tarball into the docker context
pnpm --filter 0pflow build
cd packages/core && npm pack --pack-destination docker/

# Build and push with local code
cd docker
flyctl deploy --build-only --push --image-label latest --build-arg OPFLOW_SOURCE=local
```

**Production (npm registry):**

```bash
# One-time: create a Fly app to host the image
flyctl apps create opflow-cloud-dev-image --org tiger-data

# Build and push using published 0pflow@dev from npm
cd packages/core/docker
flyctl deploy --build-only --push --image-label latest
```

To use a different registry/tag, set `CLOUD_DEV_IMAGE` on the auth server:

```bash
flyctl secrets set CLOUD_DEV_IMAGE=registry.fly.io/opflow-cloud-dev-image:latest -a opflow-auth
```

### Testing cloud dev locally

**Prerequisites:**
- Tiger CLI installed and authenticated (`tiger auth login`)
- 0pflow cloud authenticated (`0pflow login`)
- Claude Code installed and signed in (or `ANTHROPIC_API_KEY` set)
- Auth server running locally or deployed

```bash
# Create a cloud dev environment (interactive)
0pflow cloud-dev

# Check status
0pflow cloud-dev --status

# Stop the machine (preserves volume data)
0pflow cloud-dev --stop

# Destroy the machine and Fly app (deletes everything)
0pflow cloud-dev --destroy
```

### Testing the Docker image locally

```bash
# Run the image locally to verify entrypoint behavior
docker run --rm -it \
  -e APP_NAME=test-app \
  -e DEV_USER=user-local \
  -e DATABASE_URL="postgresql://..." \
  -e DATABASE_SCHEMA=test-app \
  -v /tmp/cloud-dev-data:/data \
  registry.fly.io/opflow-cloud-dev-image:latest
```

This scaffolds a project into `/tmp/cloud-dev-data/app/` and starts the dev server on port 4173.

### Cloud dev API routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/cloud-dev/create` | POST | Bearer | Create Fly app + volume + machine |
| `/api/cloud-dev/status` | GET | Bearer | Check machine state (`?appName=X`) |
| `/api/cloud-dev/stop` | POST | Bearer | Stop the machine |
| `/api/cloud-dev/destroy` | POST | Bearer | Destroy Fly app + delete DB rows (owner only) |

### Database tables

- `dev_machines` — One row per cloud dev machine (app name, Fly app name, URL, status)
- `dev_machine_members` — Many-to-many: users to machines with role (`owner`/`member`) and `linux_user` for OS-level isolation

Tables are auto-created by `ensureSchema()` on first request.

## How it connects to the core package

Users of the `@0pflow/core` package set `OPFLOW_SERVER_URL` to point at this server. The core package's `CloudIntegrationProvider` then routes all Nango operations through this server instead of calling Nango directly.

```
User's app (OPFLOW_SERVER_URL=https://opflow-auth.fly.dev)
  → CloudIntegrationProvider
    → GET /api/credentials/salesforce?connection_id=X
      → Auth server fetches from Nango with its own NANGO_SECRET_KEY
        → Returns { token, connectionConfig } to the app
```
