# crayon Auth Server

Hosted credential proxy that lets users access integrations (Salesforce, HubSpot, etc.) without needing their own Nango account. Authenticates users via GitHub OAuth and proxies Nango API calls. Also handles user app deployments to Fly.io via `flyctl`.

## Setup

### 1. Create GitHub OAuth Apps

You need two separate OAuth apps — one for local development and one for production. This is required because GitHub redirects to the registered callback URL and `localhost` and the production domain can't share an app.

**Local dev app** (for `.env.local`):
1. Go to https://github.com/settings/applications/new
2. Fill in:
   - **Application name:** `crayon local`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/github/callback`
3. Copy the Client ID and generate a client secret

**Production app** (for Fly secrets):
1. Go to https://github.com/settings/applications/new
2. Fill in:
   - **Application name:** `crayon`
   - **Homepage URL:** `https://crayon.fly.dev`
   - **Authorization callback URL:** `https://crayon.fly.dev/api/auth/github/callback`
3. Copy the Client ID and generate a client secret

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

```env
NANGO_SECRET_KEY=<your Nango secret key>
DATABASE_URL=<PostgreSQL connection string — auth server's own metadata DB>
DATABASE_DATA_URL=<admin connection string for shared TimescaleDB — see below>
GITHUB_CLIENT_ID=<from step 1>
GITHUB_CLIENT_SECRET=<from step 1>
NEXT_PUBLIC_GITHUB_CLIENT_ID=<same Client ID — needed for the browser page>
FLY_API_TOKEN=<Fly.io API token — for managing user app deployments>
FLY_ORG=personal
PUBLIC_URL=http://localhost:3000
DEV_UI_JWT_PRIVATE_KEY=<Ed25519 private key — see below>
```

#### `PUBLIC_URL` — auth server public URL

The URL injected into cloud dev machines as `CRAYON_SERVER_URL`, so their browser-based auth redirects land on this server. For local development set it to `http://localhost:3000` — the Fly machine never calls it directly, only the user's browser does.

#### `DEV_UI_JWT_PRIVATE_KEY` — Ed25519 signing key

Used to sign JWTs for cloud dev UI authentication. Generate a keypair with:

```bash
node -e "
  const { privateKey } = require('crypto').generateKeyPairSync('ed25519');
  console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));
"
```

Copy the output (including `-----BEGIN/END PRIVATE KEY-----` lines) into `.env.local`, with newlines replaced by `\n`:

```env
DEV_UI_JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMC4CAQ...\n-----END PRIVATE KEY-----\n
```

The corresponding public key is derived automatically and injected into each cloud dev machine as `DEV_UI_JWT_PUBLIC_KEY` at creation time.

### 3. Set up the database

The auth server needs a PostgreSQL database for users and auth sessions. You can use Tiger Cloud or any PostgreSQL instance. Tables are created automatically on first request.

#### `DATABASE_DATA_URL` — shared workspace database (optional)

When set, users running `crayon cloud run` can choose **"Use managed database"** instead of providing their own Tiger database. The auth server will automatically provision a dedicated PostgreSQL schema and role in this shared database for each new workspace.

- Must be an admin connection string (e.g. `tsdbadmin` on TimescaleDB Cloud)
- Each workspace gets an isolated schema named after its Fly app (e.g. `crayon_dev_a1b2c3d4`)
- The provisioned `DATABASE_URL` and `DATABASE_SCHEMA` are injected directly as Fly secrets on the workspace machine — the credentials are never stored on the auth server

```bash
# Set on the deployed auth server
flyctl secrets set DATABASE_DATA_URL="postgresql://tsdbadmin:...@host/tsdb" -a crayon
```

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
flyctl apps create crayon

# Set production secrets (different from .env.local which uses local dev values)
flyctl secrets set \
  DATABASE_URL="<production db url>" \
  DATABASE_DATA_URL="<shared db url>" \
  NANGO_SECRET_KEY="<nango key>" \
  GITHUB_CLIENT_ID="<production github app client id>" \
  GITHUB_CLIENT_SECRET="<production github app client secret>" \
  NEXT_PUBLIC_GITHUB_CLIENT_ID="<production github app client id>" \
  FLY_API_TOKEN="<fly token>" \
  FLY_ORG="<fly org>" \
  PUBLIC_URL="https://crayon.fly.dev" \
  -a crayon

# Generate and set a production Ed25519 keypair
flyctl secrets set DEV_UI_JWT_PRIVATE_KEY="$(node -e "
  const { privateKey } = require('crypto').generateKeyPairSync('ed25519');
  process.stdout.write(privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\\\n'));
")" -a crayon

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
- **Homepage URL:** `https://crayon.fly.dev`
- **Authorization callback URL:** `https://crayon.fly.dev/api/auth/github/callback`

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

Cloud dev machines let users run a full crayon dev environment (dev UI + embedded Claude Code terminal) on a Fly.io machine with persistent storage.

### Building the Docker image

The pre-built image lives at `packages/core/docker/`. It bundles Node.js, Claude Code, and crayon with pre-cached `node_modules`.

**Development (local build):**

```bash
# Build crayon and pack a tarball into the docker context
pnpm --filter runcrayon build
cd packages/core && npm pack --pack-destination docker/

# Build and push with local code
cd docker
flyctl deploy --build-only --push --image-label latest --build-arg CRAYON_SOURCE=local
```

**Production (npm registry):**

```bash
# One-time: create a Fly app to host the image
flyctl apps create crayon-cloud-dev-image --org tiger-data

# Build and push using published crayon@dev from npm
cd packages/core/docker
flyctl deploy --build-only --push --image-label latest
```

To use a different registry/tag, set `CLOUD_DEV_IMAGE` on the auth server:

```bash
flyctl secrets set CLOUD_DEV_IMAGE=registry.fly.io/crayon-cloud-dev-image:latest -a crayon
```

### Testing cloud dev locally

**Prerequisites:**
- Tiger CLI installed and authenticated (`tiger auth login`)
- crayon cloud authenticated (`crayon login`)
- Claude Code installed and signed in (or `ANTHROPIC_API_KEY` set)
- Auth server running locally or deployed

```bash
# Create a cloud dev environment (interactive)
crayon cloud-dev

# Check status
crayon cloud-dev --status

# Stop the machine (preserves volume data)
crayon cloud-dev --stop

# Destroy the machine and Fly app (deletes everything)
crayon cloud-dev --destroy
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
  registry.fly.io/crayon-cloud-dev-image:latest
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

- `dev_machines` — One row per cloud dev machine (app name, Fly app name, URL, SSH key, and optionally `shared_db_schema`/`shared_db_hostname` when the auth server provisioned the DB)
- `dev_machine_members` — Many-to-many: users to machines with role (`owner`/`member`) and `linux_user` for OS-level isolation

Tables are auto-created by `ensureSchema()` on first request.

## How it connects to the core package

Users of the `runcrayon` package set `CRAYON_SERVER_URL` to point at this server. The core package's `CloudIntegrationProvider` then routes all Nango operations through this server instead of calling Nango directly.

```
User's app (CRAYON_SERVER_URL=https://crayon.fly.dev)
  → CloudIntegrationProvider
    → GET /api/credentials/salesforce?connection_id=X
      → Auth server fetches from Nango with its own NANGO_SECRET_KEY
        → Returns { token, connectionConfig } to the app
```
