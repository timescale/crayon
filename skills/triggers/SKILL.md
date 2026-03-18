---
name: triggers
description: How to trigger workflows and nodes. Covers MCP tools (run_workflow, run_node), HTTP webhooks (async/sync), authentication, and cron scheduling.
---

# Triggers

Crayon workflows can be triggered via MCP tools, HTTP webhooks, or cron schedules.

## MCP Tools (Claude)

Use these to trigger workflows and nodes directly from Claude:

- `run_workflow` — run a workflow by name with JSON input. Returns `run_id`, `status`, and `result`.
- `run_node` — run a single node (wrapped in a workflow for durability). Takes optional `workflow_name` for connection resolution.
- `list_runs` — list recent workflow runs (optionally filtered by workflow name).
- `get_run` — get a specific run by ID (supports prefix matching like git short hashes).
- `get_trace` — get the full execution trace with operation tree and timings.

## Webhooks

Two modes for HTTP triggering:

### Test Mode

Interactive triggers (CLI, MCP tools) run in **test mode by default** — side-effect nodes describe what they would do without actually performing the action. Webhooks and cron run **live by default**. Pass `"test_mode": true` in the request body to run a webhook in test mode instead.

### Async (fire-and-forget)

```
POST /dev/api/workflows/{workflow_name}/start
Authorization: Bearer {token}
Content-Type: application/json

{"input": {}}
```

- Runs live by default (side effects are performed)
- Pass `"test_mode": true` to run in test mode instead
- Returns `202` immediately with `{ "status": "accepted", "runId": "...", "workflow": "..." }`
- The workflow runs in the background
- Poll status via `GET /dev/api/runs/{runId}` — returns `{ "status": "SUCCESS" | "ERROR" | "PENDING", ... }`

### Sync (blocking)

```
POST /dev/api/workflows/{workflow_name}/run
Authorization: Bearer {token}
Content-Type: application/json

{"input": {}}
```

- Runs live by default (side effects are performed)
- Pass `"test_mode": true` to run in test mode instead
- Blocks until the workflow completes
- Returns `200` with `{ "run_id": "...", "status": "SUCCESS", "result": ... }`
- Returns `500` on error with `{ "status": "ERROR", "error": "..." }`
- Connection stays open for the full duration of the workflow

## Authentication

Webhook requests require a Bearer token in the `Authorization` header. Tokens are Ed25519 JWTs signed by the auth-server.

**Generate a token via the Dev UI:** Open the Trigger tab → click Async or Sync → use the token generator (configurable expiry: 7d, 30d, 90d, 365d).

**Generate a token via MCP:** `generate_webhook_token` — specify expiry (7d, 30d, 90d, 365d).

**Generate a token via API:**
```
POST /dev/api/webhook-token
Content-Type: application/json

{"expiresIn": "30d"}
```
Returns `{ "data": { "token": "...", "expiresAt": "..." } }`

## URL Format

`https://{fly_app_name}.fly.dev/dev/api/workflows/{name}/start`

The `{workflow_name}` must be URL-encoded if it contains special characters.

## Cron Scheduling

Workflows can be scheduled to run on a recurring basis via the cron system. The auth-server acts as the external scheduler — it sends HTTP requests to machines at the right times, auto-waking them from Fly.io's `auto_stop`.

**Manage schedules via Dev UI:** Open the Schedule tab to create, pause, resume, or delete schedules.

**Manage via MCP tools:**
- `list_cron_jobs` — list all scheduled jobs
- `create_cron_job` — create a new schedule (cron expression + timezone)
- `update_cron_job` — update schedule, enable/disable
- `delete_cron_job` — remove a schedule
- `list_cron_runs` — view execution history for a job

**Test mode:** Cron jobs run live by default. To run a cron job in test mode, include `"test_mode": true` in the job's input JSON when creating or updating the job. This value is forwarded to the workflow execution.

**Cron behavior:**
- Scheduler ticks every 15 seconds
- Jobs that fail 10 consecutive times are automatically disabled
- The cron run status tracks both the trigger (HTTP call) and the workflow outcome (polled from DBOS)
- Run statuses: `triggered` → `success` | `error` | `timeout`
