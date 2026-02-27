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
crayon cloud run
```
Want to contribute? See [DEVELOPMENT.md](DEVELOPMENT.md).

## Quick Start

```bash
crayon cloud run
```

This spins up a cloud sandbox and opens the dev environment in your browser. Describe what you want to automate — Claude will build, test, and iterate on your workflow automatically. Once ready, trigger it manually or connect it to a webhook.

Prefer working in your terminal?
```bash
crayon cloud claude
```


## CLI Commands

| Command | Description |
|---------|-------------|
| `crayon cloud run` | Start a new or existing workspace |
| `crayon cloud claude` | Connect to a claude session on the sanbox |


## Project Structure

```
crayon/
├── packages/
│   ├── core/         # SDK + CLI + MCP server + Dev UI (published as `crayon`)
│   ├── ui/           # React UI components (@crayon/ui)
│   └── auth-server/  # OAuth server (Nango-based)
└── skills/           # Claude Code skills
    ├── create-workflow/
    ├── compile-workflow/
    ├── refine-node/
    ├── integrations/
    └── deploy/
```

## Requirements

- Node.js 22+
- A Claude Subscription