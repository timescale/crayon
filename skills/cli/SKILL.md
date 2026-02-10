---
name: cli
description: Reference for 0pflow CLI commands - manage workflows, nodes, and view execution history.
---

# 0pflow CLI Reference

The 0pflow CLI is used to manage and run workflows and nodes from the command line.

## Running the CLI

From a 0pflow project:

```bash
npm run 0pflow <command>
```

Or directly:

```bash
npx 0pflow <command>
```

---

## Commands Overview

```
0pflow workflow list          # List all workflows
0pflow workflow run <name>    # Run a workflow
0pflow node list              # List all nodes
0pflow node run <name>        # Run a node
0pflow history [run-id]       # View execution history
0pflow trace <run-id>         # Show execution trace
```

---

## Workflow Commands

### workflow list

List all available workflows discovered in `generated/workflows/`.

```bash
npx 0pflow workflow list
npx 0pflow workflow list --json
```

**Options:**
- `--json` - Output as JSON (useful for scripting)

**Example output:**
```
Available workflows:

  lead-scoring (v1)
  outreach-automation (v2)
```

---

### workflow run

Execute a workflow with optional input.

```bash
npx 0pflow workflow run <workflow-name>
npx 0pflow workflow run <workflow-name> -i '<json-input>'
npx 0pflow workflow run <workflow-name> --json
```

**Arguments:**
- `<workflow-name>` - Name of the workflow to run (required)

**Options:**
- `-i, --input <json>` - JSON input for the workflow (default: `{}`)
- `--json` - Output result as JSON

**Examples:**

```bash
# Run with no input
npx 0pflow workflow run lead-scoring

# Run with JSON input
npx 0pflow workflow run lead-scoring -i '{"company_url": "https://example.com"}'

# Run and get JSON output (for piping)
npx 0pflow workflow run lead-scoring -i '{"company_url": "https://example.com"}' --json
```

**Notes:**
- Requires `DATABASE_URL` in `.env`
- Validates input against the workflow's input schema
- Displays result on success or error message on failure

**Environment variables:**
- `LOG_LEVEL` - Set logging verbosity: `debug`, `info` (default), `warn`, `error`

```bash
# Run with debug logging
LOG_LEVEL=debug npx 0pflow workflow run lead-scoring -i '{"company_url": "https://example.com"}'
```

---

## Node Commands

### node list

List all available nodes discovered in `src/nodes/`.

```bash
npx 0pflow node list
npx 0pflow node list --json
```

**Options:**
- `--json` - Output as JSON (useful for scripting)

**Example output:**
```
Available nodes:

  echo - Echoes back the input message
  http-head - HTTP HEAD request for uptime checks
```

---

### node run

Execute a node with optional input. Nodes are wrapped in a workflow for full DBOS durability and history tracking.

```bash
npx 0pflow node run <node-name>
npx 0pflow node run <node-name> -i '<json-input>'
npx 0pflow node run <node-name> --json
```

**Arguments:**
- `<node-name>` - Name of the node to run (required)

**Options:**
- `-i, --input <json>` - JSON input for the node (default: `{}`)
- `--json` - Output result as JSON

**Examples:**

```bash
# Run with no input
npx 0pflow node run echo

# Run with JSON input
npx 0pflow node run echo -i '{"message": "Hello world"}'

# Run and get JSON output
npx 0pflow node run http-head -i '{"url": "https://example.com"}' --json
```

**Notes:**
- Requires `DATABASE_URL` in `.env`
- Validates input against the node's input schema
- Node runs appear in history as `_node_<name>` (wrapper workflow)

---

## History & Trace Commands

### history

View past workflow/node executions or details of a specific run.

```bash
npx 0pflow history
npx 0pflow history <run-id>
npx 0pflow history -w <workflow-name>
npx 0pflow history -n <limit>
```

**Arguments:**
- `[run-id]` - Optional run ID (full UUID or prefix, like git short hashes)

**Options:**
- `-n, --limit <number>` - Number of runs to show (default: 20)
- `-w, --workflow <name>` - Filter by workflow name
- `--json` - Output as JSON

**Examples:**

```bash
# List recent runs
npx 0pflow history

# List last 5 runs
npx 0pflow history -n 5

# Filter by workflow
npx 0pflow history -w lead-scoring

# Get details of a specific run (supports short IDs)
npx 0pflow history a1b2c3d4

# Get full run details as JSON
npx 0pflow history a1b2c3d4-e5f6-... --json
```

**Output columns:**
- **ID** - Short run ID (first 8 characters)
- **Workflow** - Workflow name (or `_node_<name>` for node runs)
- **Status** - SUCCESS, ERROR, or PENDING
- **Created** - When the run started

**Detailed view (with run-id):**
- Full UUID
- Workflow name
- Status
- Created/Updated timestamps
- Output (if successful)
- Error (if failed)

---

### trace

Show execution trace for a workflow run, including all operations and child workflows.

```bash
npx 0pflow trace <run-id>
npx 0pflow trace <run-id> --json
```

**Arguments:**
- `<run-id>` - Run ID (full UUID or prefix, like git short hashes)

**Options:**
- `--json` - Output as JSON

**Examples:**

```bash
# Show trace for a run (supports short IDs)
npx 0pflow trace a1b2c3d4

# Get trace as JSON
npx 0pflow trace a1b2c3d4 --json
```

**Example output:**
```
Workflow: lead-qualifier (8fcfb347-cb5a-46f6-9158-5fc53915ec86)
Status: SUCCESS | Duration: 12.3s

├─ salesforce-get-lead                                1401ms
│    → {"Id":"00Q3s...","Company":"Acme"}
│
├─ company-researcher                                 7355ms
│    ├─ web_search                                     256ms
│    │    → web_search({"query":"Acme company"})
│    └─ result                                        7099ms
│         → {"name":"Acme","employee_count":800}
│
└─ icp-evaluator                                      2102ms
     → {"qualified":false,"reasons":["..."]}

Final:
{
  "qualified": false,
  "reasons": ["exceeds 50 employee maximum"]
}
```

**Trace shows:**
- Workflow name, ID, status, and total duration
- All operations with their durations
- Child workflows nested under their parent operation
- Tool calls with inputs (e.g., `web_search({"query":"..."})`)
- Output previews for each operation
- Full pretty-printed final result

---

## Prerequisites

Before running workflows:

1. **Compile workflows** - Run `/0pflow:compile-workflow` to generate the workflow implementation
2. **Database connection** - Ensure `DATABASE_URL` is set in `.env`
3. **Build the project** - Run `npm run build` if using TypeScript

---

## Troubleshooting

**"No workflows found"**
- Check that `generated/workflows/` contains compiled workflow files
- Run `/0pflow:compile-workflow` to compile workflows

**"No nodes found"**
- Check that `src/nodes/` contains node files
- Ensure nodes export using `Node.create()`

**"Invalid workflow/node input"**
- Check the workflow's input schema in `generated/workflows/<name>.ts`
- Or check the node's `inputSchema` in `src/nodes/<name>.ts`
- Ensure JSON input matches the expected types

**"DATABASE_URL not set"**
- Run `setup_app_schema` to configure the database
- Or manually set `DATABASE_URL` in `.env`
