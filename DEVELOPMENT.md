# Developer Guide

To use the plugin from source:

```bash
git clone https://github.com/timescale/crayon.git
cd crayon
pnpm install
pnpm build
npx tsx packages/core/src/cli/index.ts install --force
```

> **Note:** This outputs the `claude --plugin-dir <path>` command you need to run Claude Code with the local plugin.

## Testing Local Changes Against Cloud

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
