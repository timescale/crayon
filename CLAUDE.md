# crayon

AI-native workflow engine for GTM/RevOps automation.

## Project Structure

Monorepo using pnpm workspaces:

```
crayon/
├── packages/
│   ├── core/              # Main SDK + CLI + MCP server + Dev UI (published as `crayon`)
│   ├── ui/                # React UI components (@crayon/ui)
│   └── auth-server/       # Next.js OAuth server (private, Nango-based)
├── skills/                # Claude Code skills
├── examples/uptime-app/   # Example app using crayon
├── docs/plans/            # Design documents
└── scripts/               # MCP server launcher
```

## Claude Code Plugin

This repo is a Claude Code plugin. Load it with:
```bash
claude --plugin-dir /path/to/crayon
```

### Available Skills

- `/crayon:create-workflow` - Collaborative workflow design (guides through creating workflows with embedded descriptions)
- `/crayon:refine-node` - Refine node definitions (adds tools, guidelines, typed Zod schemas to nodes)
- `/crayon:compile-workflow` - Update workflow implementation from embedded descriptions
- `/crayon:integrations` - Generate integration nodes for external APIs (Salesforce, HubSpot, etc.)
- `/crayon:deploy` - Deploy a crayon app to the cloud. Verifies deployment files, sets up environment, and deploys.

### MCP Tools

12 tools exposed via `scripts/run-mcp.cjs` (prefixed `mcp__plugin_crayon_crayon-local-tools__`):

- `createApp` / `createDatabase` / `setupAppSchema` - Project scaffolding
- `listIntegrations` / `getConnectionInfo` - OAuth connection management
- `listWorkflows` / `runWorkflow` / `runNode` - Workflow execution
- `listRuns` / `getRun` / `getTrace` - Run history and tracing

## Architecture Overview

**Workflow code with embedded descriptions** → **Compiler** (Claude Code skill) → **Updated implementation** → **DBOS runtime**

- Descriptions embedded in code as `description` fields (workflow-level for flow, node-level for details)
- Agent specs (`specs/agents/`) are separate markdown files used as runtime system prompts
- No separate spec files for workflows — the code IS the spec
- DBOS provides durability: workflows register as DBOS workflows, nodes run as DBOS steps

### Node Types

| Type | Location | Example |
|------|----------|---------|
| Built-in | `crayon` package | `webRead` |
| User node | `src/nodes/` in app | Custom logic functions |
| Agent | `agents/` + `specs/agents/` in app | AI reasoning via Vercel AI SDK |

### App Template Structure (scaffolded by `createApp`)

```
my-app/
├── generated/workflows/    # Compiled workflows (checked into git)
├── src/nodes/              # User-defined function nodes
├── agents/                 # Agent TypeScript files
├── specs/agents/           # Agent markdown specs (system prompts)
├── src/lib/crayon.ts        # crayon singleton
└── dbos-config.yaml        # DBOS runtime config
```

## Key Source Paths (packages/core/src/)

### SDK Core
- `index.ts` - Public API exports
- `factory.ts` - `createCrayon()` factory
- `workflow.ts` - `Workflow.create()`, WorkflowContext, DBOS integration
- `node.ts` - `Node.create()` for function nodes
- `agent.ts` - `Agent.create()` for AI agents
- `types.ts` - Executable interface, WorkflowContext, CrayonConfig
- `registry.ts` - Workflow/agent/node registry
- `discover.ts` - Auto-discovery from project directories

### Agent Execution
- `nodes/agent/executor.ts` - Agent execution with Vercel AI SDK (`generateText`)
- `nodes/agent/parser.ts` - Parse agent spec markdown files
- `nodes/agent/model-config.ts` - Model provider config (OpenAI, Anthropic)

### Connections (OAuth)
- `connections/resolver.ts` - Connection ID resolution (workflow → node → integration hierarchy)
- `connections/local-integration-provider.ts` - Self-hosted Nango mode
- `connections/cloud-integration-provider.ts` - crayon cloud proxy mode

### CLI (`cli/`)
- `index.ts` - Commander.js CLI entry point
- `run.ts` - Interactive `crayon run` (create or launch project)
- `discovery.ts` - Workflow/node/agent discovery via jiti
- `runs.ts` / `trace.ts` - Run history and trace viewing

### Dev UI (`dev-ui/`)
- `dev-server.ts` - Vite + Express dev server
- `api.ts` - REST API for workflows/runs/connections
- `watcher.ts` - File watcher for live DAG updates
- `dag/` - React Flow DAG visualization
- `pty.ts` - Embedded Claude Code terminal

### MCP Tools (`cli/mcp/tools/`)
- Each tool is a separate file with Zod input/output schemas
- Discovery uses jiti to load TypeScript files directly (no compilation)

## CLI Commands

| Command | Description |
|---------|-------------|
| `crayon run` | Interactive: create new project or launch existing |
| `crayon dev` | Start Dev UI with live DAG + embedded Claude Code |
| `crayon workflow list` | List workflows (`--json` supported) |
| `crayon workflow run <name>` | Run workflow with `-i <json>` |
| `crayon node list` / `node run <name>` | List/run nodes |
| `crayon history [run-id]` | List runs or get details |
| `crayon trace <run-id>` | Show execution trace |
| `crayon install` / `uninstall` | Install/remove Claude Code plugin |
| `crayon deploy` | Deploy app to the cloud |
| `crayon login` / `logout` | Authenticate with crayon cloud |
| `crayon mcp start` | Start MCP server |

## Development

- **Build:** `pnpm --filter runcrayon build` (TypeScript + Vite for dev-ui)
- **Test:** Vitest — `pnpm --filter runcrayon test`
- **Lint/Format:** Biome — `pnpm biome check`
- **CI:** GitHub Actions (`publish-dev.yml`) publishes to npm with `dev` tag on push to main

## Deployment

- **auth-server:** `cd packages/auth-server && flyctl deploy`

## Key Documents

- `docs/plans/2026-01-23-crayon-design.md` - Main design document (architecture, SDK API, spec formats, MVP scope)
- `docs/plans/2026-01-23-outreach-automation-example.md` - Reference implementation example
