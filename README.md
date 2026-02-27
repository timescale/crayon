# crayon

AI-native workflow engine for GTM/RevOps automation.

## Installation

Get started with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/timescale/crayon/main/scripts/install.sh | bash
```

This installs all dependencies (Node.js, Claude Code, Tiger CLI) and sets up the `crayon` command.

After installation, open a new terminal and run:

```bash
crayon run
```
___
### Want to contribute? - Developer Guide

To use the plugin from source:

```bash
git clone https://github.com/timescale/crayon.git
cd crayon
pnpm install
pnpm build
npx tsx packages/core/src/cli/index.ts install --force
```

> **Note:** This outputs the `claude --plugin-dir <path>` command you need to run Claude Code with the local plugin.

## Quick Start

From an app directory (e.g., `examples/uptime-app`):

```bash
# List available workflows
pnpm crayon list

# Run a workflow
pnpm crayon run url-check -i '{"url": "https://example.com"}'

# View run history
pnpm crayon history

# Get details for a specific run (supports short IDs like git)
pnpm crayon history bc44c8b1
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `crayon list` | List all available workflows |
| `crayon list --json` | Output as JSON |
| `crayon run <workflow> -i <json>` | Run a workflow with JSON input |
| `crayon run <workflow> --json` | Output result as JSON |
| `crayon history` | List past workflow executions |
| `crayon history -n 10` | Limit to N runs |
| `crayon history -w <name>` | Filter by workflow name |
| `crayon history <run-id>` | Get details of a specific run |

## Project Structure

```
crayon/
├── packages/
│   ├── core/       # SDK + runtime (crayon)
│   ├── cli/        # CLI tool (runcrayon)
│   └── ui/         # UI components (@crayon/ui)
├── skills/         # Claude Code skills
│   ├── spec-author/
│   ├── compile-workflow/
│   └── validate-spec/
└── examples/
    └── uptime-app/ # Example application
```

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

## Requirements

- Node.js 20+
- PostgreSQL with TimescaleDB (or use Timescale Cloud)
- `DATABASE_URL` environment variable
