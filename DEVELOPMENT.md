# Developer Guide

To use the plugin from source:

```bash
git clone https://github.com/timescale/crayon.git
cd crayon
pnpm install
pnpm build
```

> **Note:** This outputs the `claude --plugin-dir <path>` command you need to run Claude Code with the local plugin.

## Local Development

`crayon local run-dev` starts the auth-server alongside the dev UI so you can test cloud features (cron scheduling, webhook tokens) locally. This command is only available when running from the monorepo.

### Prerequisites

1. **Auth-server `.env.local`** must exist at `packages/auth-server/.env.local` with the required env vars (see `packages/auth-server/README.md`). It should point to the same `DATABASE_URL` as the deployed auth-server so your CLI token works. Contents can be found in 1password "Crayon auth-server secrets".

2. **CLI login** — run `crayon login` once so `~/.crayon/credentials` has a valid token.

### Usage

```bash
npx tsx /path/to/crayon/packages/core/src/cli/index.ts local run-dev
```

This will:
- Start the auth-server on `http://localhost:3000`
- Set `CRAYON_SERVER_URL` and `CRAYON_TOKEN` automatically
- Launch the dev UI with cloud features enabled (webhook section, cron scheduling)
- Open the browser and start Claude Code



## Testing Local Changes On Cloud

To test local core changes on a cloud dev machine:

1. **Build & push a Docker image with your changes:**
   ```bash
   cd packages/core/docker && ./build-dev.sh <tag>
   ```

2. **Start the local auth server** (separate terminal):
   ```bash
   cd packages/auth-server && pnpm dev
   ```

3. **Create a new cloud machine using the local auth server:**
   ```bash
   CRAYON_SERVER_URL=http://localhost:3000 pnpm --filter runcrayon exec node dist/cli/index.js cloud run
   ```

4. **Open the dev UI** at `https://<fly-app-name>.fly.dev/dev/`
