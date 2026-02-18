# 0pflow Auth Server

Hosted credential proxy that lets users access integrations (Salesforce, HubSpot, etc.) without needing their own Nango account. Authenticates users via GitHub OAuth and proxies Nango API calls.

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

> For production, update the Homepage URL and callback URL to your deployed domain (e.g. `https://auth.0pflow.dev/api/auth/github/callback`).

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
```

### 3. Install and run

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

## Deploying to Vercel

```bash
# 1. Link the project (first time only — set Root Directory to packages/auth-server)
cd packages/auth-server
vercel link

# 2. Upload env vars from .env.local as sensitive secrets
./deploy-env.sh

# 3. Deploy to production
vercel --prod
```

After deploying, update your GitHub OAuth App at https://github.com/settings/developers:
- **Homepage URL:** `https://<your-domain>`
- **Authorization callback URL:** `https://<your-domain>/api/auth/github/callback`

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
| `/api/deploy/prepare` | POST | Bearer | Prepare deployment (link DB, register app, set secrets) |
| `/api/deploy/upload` | POST | Bearer | Upload deployment archive to DBOS Cloud |
| `/api/deploy/status` | GET | Bearer | Get deployment status (`?appName=X`) |
| `/api/deploy/logs` | GET | Bearer | Get deployment logs (`?appName=X`) |

## Deployment Proxy (DBOS Cloud)

The auth-server also acts as a white-label proxy for DBOS Cloud deployment. See [DEPLOYMENT.md](./DEPLOYMENT.md) for full documentation.

**Quick setup:**

1. Create a DBOS Cloud account: `npx dbos-cloud login --get-refresh-token`
2. Add to `.env.local`:
   ```
   DBOS_CLOUD_REFRESH_TOKEN=<from ~/.dbos/credentials>
   DBOS_CLOUD_ORGANIZATION=<from ~/.dbos/credentials>
   ```
3. Users deploy with `0pflow deploy` — the auth-server handles all DBOS Cloud interactions.

## How it connects to the core package

Users of the `@0pflow/core` package set `OPFLOW_SERVER_URL` to point at this server. The core package's `CloudIntegrationProvider` then routes all Nango operations through this server instead of calling Nango directly.

```
User's app (OPFLOW_SERVER_URL=https://auth.0pflow.dev)
  → CloudIntegrationProvider
    → GET /api/credentials/salesforce?connection_id=X
      → Auth server fetches from Nango with its own NANGO_SECRET_KEY
        → Returns { token, connectionConfig } to the app
```
