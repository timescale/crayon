---
name: deploy
description: Deploy a crayon app to the cloud. Verifies deployment files, sets up environment, and deploys.
---

# Deploy to Cloud

Deploys a crayon app to the cloud using `crayon deploy`.

**Announce at start:** "I'm using the deploy skill to prepare and deploy this app."

---

## Pre-Flight Checks

1. **Verify this is a crayon app:**
   - `package.json` must exist with `crayon` as a dependency
   - `generated/workflows/` should exist with at least one compiled workflow

2. **Verify `.env` exists with required variables:**
   - `DATABASE_URL` — Application database connection string (required)
   - Any other secrets your workflows need (API keys, etc.)

3. **Verify the app builds:**
   ```bash
   npm run build
   ```
   - Fix any build errors before deploying

---

## Phase 1: Authenticate

If not already authenticated:

```bash
crayon login
```

This opens a browser for GitHub OAuth and stores a session token locally.

---

## Phase 2: Deploy

```bash
crayon deploy
```

This command:
1. Packages the application (excluding `node_modules`, `.git`, `.next`, `dist`, `.env`)
2. Uploads the code to a cloud VM
3. Runs `npm install` and `npm run build` remotely
4. Starts the app with `npm run start` on port 3000
5. Returns the public URL

The deploy command handles both first-time deployments and re-deployments automatically. On re-deploy, the existing VM is reused — only the code is updated.

---

## Phase 3: Verify Deployment

After deployment completes:

1. **Check the URL** printed by the deploy command
2. **Test a workflow endpoint:**
   ```bash
   curl <app-url>/api/workflow/<workflow-name>
   ```

---

## Troubleshooting

### Deploy fails during authentication

Run `crayon login` manually and retry.

### Build fails remotely

The deploy command will report build errors. Common causes:
- Missing dependencies in `package.json`
- TypeScript errors not caught locally
- Environment variables needed at build time

Fix the issue locally, verify with `npm run build`, then re-deploy.

### App not responding after deploy

The app may take a moment to start. If it doesn't become available:
- Check that `npm run start` works locally
- Ensure the app listens on port 3000
- Verify `DATABASE_URL` is correct and the database is accessible

---

## Environment Variables

All variables from `.env` are synced to the cloud VM during deploy, except:
- `DBOS_ADMIN_URL`
- `DBOS_SYSTEM_DATABASE_URL`
- `DBOS_CONDUCTOR_KEY`

Additionally, `CRAYON_TOKEN` is automatically included for runtime integration credential fetching.

---

## Dev UI

The Dev UI also has a **Deploy** button in the sidebar that triggers the same deploy flow with live progress updates.
