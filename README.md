# 0pflow

AI-native workflow engine for GTM/RevOps automation.

## Installation

Install the 0pflow plugin for Claude Code:

```bash
npx -y 0pflow@dev install --force
```

### Development Mode

To use the plugin from source (for development):

```bash
git clone https://github.com/timescale/0pflow.git
cd 0pflow
pnpm install
pnpm build
npx tsx packages/core/src/cli/index.ts install --force
```

> **Note:** This outputs the `claude --plugin-dir <path>` command you need to run Claude Code with the local plugin.

## Quick Start

From an app directory (e.g., `examples/uptime-app`):

```bash
# List available workflows
pnpm 0pflow list

# Run a workflow
pnpm 0pflow run url-check -i '{"url": "https://example.com"}'

# View run history
pnpm 0pflow history

# Get details for a specific run (supports short IDs like git)
pnpm 0pflow history bc44c8b1
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `0pflow list` | List all available workflows |
| `0pflow list --json` | Output as JSON |
| `0pflow run <workflow> -i <json>` | Run a workflow with JSON input |
| `0pflow run <workflow> --json` | Output result as JSON |
| `0pflow history` | List past workflow executions |
| `0pflow history -n 10` | Limit to N runs |
| `0pflow history -w <name>` | Filter by workflow name |
| `0pflow history <run-id>` | Get details of a specific run |

## Project Structure

```
0pflow/
├── packages/
│   ├── core/       # SDK + runtime (0pflow)
│   ├── cli/        # CLI tool (@0pflow/cli)
│   └── ui/         # UI components (@0pflow/ui)
├── skills/         # Claude Code skills
│   ├── spec-author/
│   ├── compile-workflow/
│   └── validate-spec/
└── examples/
    └── uptime-app/ # Example application
```

## Requirements

- Node.js 20+
- PostgreSQL with TimescaleDB (or use Timescale Cloud)
- `DATABASE_URL` environment variable
