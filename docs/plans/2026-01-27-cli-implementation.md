# CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 0pflow CLI with commands to list workflows, run workflows, and view run history.

**Architecture:** CLI walks up directories to find `.env` and loads all variables into `process.env`, loads workflows from `generated/workflows/` in cwd, uses existing `create0pflow()` factory for workflow execution, and queries DBOS tables directly for run history.

**Tech Stack:** Commander.js (CLI framework), picocolors (terminal colors), dotenv (env loading), pg (database queries), jiti (TypeScript loader for runtime imports)

---

## Task 1: Add Dependencies

**Files:**
- Modify: `packages/cli/package.json`

**Step 1: Add dotenv, pg, cli-table3, jiti, and 0pflow**

Run:
```bash
cd packages/cli && pnpm add dotenv pg cli-table3 jiti 0pflow@workspace:* && pnpm add -D @types/pg
```

Note: `0pflow@workspace:*` adds the local workspace package as a dependency (required for `create0pflow` import in the run command).

**Step 2: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore(cli): add dotenv, pg, cli-table3, jiti, and 0pflow dependencies"
```

---

## Task 2: Add vitest.config.ts

**Files:**
- Create: `packages/cli/vitest.config.ts`

**Step 1: Create vitest config with .env loading**

```typescript
// packages/cli/vitest.config.ts
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
```

**Step 2: Commit**

```bash
git add packages/cli/vitest.config.ts
git commit -m "chore(cli): add vitest config with .env loading"
```

---

## Task 3: Environment Resolution Utility

**Files:**
- Create: `packages/cli/src/env.ts`
- Test: `packages/cli/src/__tests__/env.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findEnvFile } from "../env.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("findEnvFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it("finds .env in current directory", () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "TEST=1");
    const result = findEnvFile(tempDir);
    expect(result).toBe(path.join(tempDir, ".env"));
  });

  it("finds .env in parent directory", () => {
    const subDir = path.join(tempDir, "sub");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tempDir, ".env"), "TEST=1");
    const result = findEnvFile(subDir);
    expect(result).toBe(path.join(tempDir, ".env"));
  });

  it("returns null if no .env found", () => {
    const result = findEnvFile(tempDir);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test`
Expected: FAIL with "Cannot find module '../env.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/cli/src/env.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Walk up from startDir looking for .env file
 * Returns absolute path to .env or null if not found
 */
export function findEnvFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    dir = path.dirname(dir);
  }

  // Check root directory too
  const rootEnv = path.join(root, ".env");
  if (fs.existsSync(rootEnv)) {
    return rootEnv;
  }

  return null;
}

/**
 * Load .env file into process.env
 * Throws if DATABASE_URL is not set (required for 0pflow)
 */
export function loadEnv(envPath: string): void {
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    throw new Error(`Failed to load .env: ${result.error.message}`);
  }

  // DATABASE_URL is required for 0pflow
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not found in .env\n" +
      "Add a PostgreSQL connection string, e.g.:\n" +
      "  DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    );
  }
}

/**
 * Find .env starting from cwd and load it into process.env
 */
export function resolveEnv(): void {
  const envPath = findEnvFile(process.cwd());
  if (!envPath) {
    throw new Error(
      "No .env file found in current directory or parents\n" +
      "Create a .env file with at least:\n" +
      "  DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    );
  }
  loadEnv(envPath);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/env.ts packages/cli/src/__tests__/env.test.ts
git commit -m "feat(cli): add environment resolution utility"
```

---

## Task 4: Workflow Discovery

**Files:**
- Create: `packages/cli/src/discovery.ts`
- Test: `packages/cli/src/__tests__/discovery.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/discovery.test.ts
import { describe, it, expect } from "vitest";
import { discoverWorkflows } from "../discovery.js";
import path from "path";

describe("discoverWorkflows", () => {
  it("returns empty result if generated/workflows does not exist", async () => {
    const result = await discoverWorkflows("/nonexistent");
    expect(result.workflows).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("discovers workflow executables from uptime-app", async () => {
    const projectRoot = path.resolve(__dirname, "../../../../..");
    const uptimeApp = path.join(projectRoot, "examples/uptime-app");
    const result = await discoverWorkflows(uptimeApp);
    expect(result.workflows.length).toBeGreaterThan(0);
    // Returns actual workflow executables with name and type
    expect(result.workflows.some(w => w.name === "url-check")).toBe(true);
    expect(result.workflows.every(w => w.type === "workflow")).toBe(true);
  });

  it("collects warnings for failed imports without throwing", async () => {
    // Warnings are collected, not printed, so caller can decide what to do
    const result = await discoverWorkflows("/nonexistent");
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test`
Expected: FAIL with "Cannot find module '../discovery.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/cli/src/discovery.ts
import fs from "fs";
import path from "path";
import { createJiti } from "jiti";
import type { Executable } from "0pflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowExecutable = Executable<any, any>;

const jiti = createJiti(import.meta.url);

export interface DiscoveryResult {
  workflows: WorkflowExecutable[];
  warnings: string[];
}

/**
 * Check if a value is a workflow executable
 */
function isWorkflow(value: unknown): value is WorkflowExecutable {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "workflow"
  );
}

/**
 * Discover and load workflow executables from generated/workflows/ directory
 * Uses jiti to load TypeScript files directly without compilation
 * Returns workflows and any warnings (caller decides whether to display warnings)
 */
export async function discoverWorkflows(
  projectDir: string
): Promise<DiscoveryResult> {
  const workflowDir = path.join(projectDir, "generated", "workflows");

  if (!fs.existsSync(workflowDir)) {
    return { workflows: [], warnings: [] };
  }

  const files = fs.readdirSync(workflowDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
  const workflows: WorkflowExecutable[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(workflowDir, file);

    try {
      const module = await jiti.import(filePath);

      // Find the workflow export in the module
      for (const value of Object.values(module as Record<string, unknown>)) {
        if (isWorkflow(value)) {
          workflows.push(value);
          break; // One workflow per file
        }
      }
    } catch (err) {
      warnings.push(`Failed to load workflow ${file}: ${err}`);
    }
  }

  return { workflows, warnings };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/discovery.ts packages/cli/src/__tests__/discovery.test.ts
git commit -m "feat(cli): add workflow discovery from generated/workflows"
```

---

## Task 5: Run History Queries

**Files:**
- Create: `packages/cli/src/runs.ts`
- Test: `packages/cli/src/__tests__/runs.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/runs.test.ts
import { describe, it, expect } from "vitest";
import { listRuns, getRun } from "../runs.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("runs", () => {
  it("lists recent workflow runs", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 10 });
    expect(Array.isArray(runs)).toBe(true);
    // Each run should have expected fields
    if (runs.length > 0) {
      expect(runs[0]).toHaveProperty("workflow_uuid");
      expect(runs[0]).toHaveProperty("name");
      expect(runs[0]).toHaveProperty("status");
    }
  });

  it("gets a specific run by full id", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1 });
    if (runs.length > 0) {
      const result = await getRun(DATABASE_URL!, runs[0].workflow_uuid);
      expect(result.run).not.toBeNull();
      expect(result.run!.workflow_uuid).toBe(runs[0].workflow_uuid);
      expect(result.ambiguous).toBeUndefined();
    }
  });

  it("gets a specific run by id prefix", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1 });
    if (runs.length > 0) {
      // Use first 8 characters as prefix (like displayed in history)
      const prefix = runs[0].workflow_uuid.slice(0, 8);
      const result = await getRun(DATABASE_URL!, prefix);
      // Should find the run (may be ambiguous if multiple runs share prefix)
      if (!result.ambiguous) {
        expect(result.run).not.toBeNull();
        expect(result.run!.workflow_uuid.startsWith(prefix)).toBe(true);
      }
    }
  });

  it("returns null for non-existent run", async () => {
    const result = await getRun(DATABASE_URL!, "non-existent-id");
    expect(result.run).toBeNull();
    expect(result.ambiguous).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test`
Expected: FAIL with "Cannot find module '../runs.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/cli/src/runs.ts
import pg from "pg";

export interface WorkflowRun {
  workflow_uuid: string;
  name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  output: unknown;
  error: string | null;
}

export interface ListRunsOptions {
  limit?: number;
  workflowName?: string;
}

/**
 * List recent workflow runs from DBOS tables
 */
export async function listRuns(
  databaseUrl: string,
  options: ListRunsOptions = {}
): Promise<WorkflowRun[]> {
  const { limit = 20, workflowName } = options;
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    let query = `
      SELECT workflow_uuid, name, status, created_at, updated_at, output, error
      FROM dbos.workflow_status
    `;
    const params: (string | number)[] = [];

    if (workflowName) {
      query += ` WHERE name = $1`;
      params.push(workflowName);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

export interface GetRunResult {
  run: WorkflowRun | null;
  ambiguous?: boolean;
}

/**
 * Get a specific workflow run by ID or ID prefix (like git short hashes)
 * Returns { run, ambiguous } where ambiguous is true if prefix matched multiple runs
 */
export async function getRun(
  databaseUrl: string,
  runId: string
): Promise<GetRunResult> {
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    // Try exact match first
    const exact = await client.query(
      `SELECT workflow_uuid, name, status, created_at, updated_at, output, error
       FROM dbos.workflow_status
       WHERE workflow_uuid = $1`,
      [runId]
    );

    if (exact.rows[0]) {
      return { run: exact.rows[0] };
    }

    // Try prefix match (like git short hashes)
    const prefix = await client.query(
      `SELECT workflow_uuid, name, status, created_at, updated_at, output, error
       FROM dbos.workflow_status
       WHERE workflow_uuid LIKE $1
       ORDER BY created_at DESC
       LIMIT 2`,
      [runId + "%"]
    );

    if (prefix.rows.length === 0) {
      return { run: null };
    }

    if (prefix.rows.length > 1) {
      return { run: null, ambiguous: true };
    }

    return { run: prefix.rows[0] };
  } finally {
    await client.end();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/runs.ts packages/cli/src/__tests__/runs.test.ts
git commit -m "feat(cli): add run history queries"
```

---

## Task 6: Implement `list` Command

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Update the list command**

Replace the existing skeleton with the full implementation:

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { discoverWorkflows } from "./discovery.js";

const program = new Command();

program
  .name("0pflow")
  .description("CLI for 0pflow workflow engine")
  .version("0.1.0");

program
  .command("list")
  .description("List all available workflows")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const { workflows, warnings } = await discoverWorkflows(process.cwd());

      // Always show warnings on stderr (doesn't pollute stdout for JSON parsing)
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      if (workflows.length === 0) {
        if (options.json) {
          console.log("[]");
        } else {
          console.log(pc.yellow("No workflows found in generated/workflows/"));
        }
        return;
      }

      if (options.json) {
        const output = workflows.map(w => ({
          name: w.name,
          version: w.version,
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(pc.bold("\nAvailable workflows:\n"));
        for (const w of workflows) {
          const version = w.version ? ` (v${w.version})` : "";
          console.log(`  ${pc.cyan(w.name)}${pc.dim(version)}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

program.parse();
```

**Step 2: Build and test manually**

Run:
```bash
cd packages/cli && pnpm build
cd ../../examples/uptime-app && npx 0pflow list
```
Expected: Shows url-check and url-summarizer workflows

**Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): implement list command"
```

---

## Task 7: Implement `run` Command

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Add run command after list command**

```typescript
import { create0pflow } from "0pflow";
import { resolveEnv } from "./env.js";

program
  .command("run <workflow>")
  .description("Run a workflow")
  .option("-i, --input <json>", "JSON input for the workflow", "{}")
  .option("--json", "Output result as JSON")
  .action(async (workflowName: string, options: { input: string; json?: boolean }) => {
    try {
      // Load environment (all .env vars into process.env)
      resolveEnv();

      // Discover workflows
      const { workflows, warnings } = await discoverWorkflows(process.cwd());

      // Always show warnings on stderr
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      const workflow = workflows.find(w => w.name === workflowName);

      if (!workflow) {
        console.error(pc.red(`Workflow "${workflowName}" not found`));
        console.log(pc.dim(`Available: ${workflows.map(w => w.name).join(", ")}`));
        process.exit(1);
      }

      // Parse input JSON
      let rawInput: unknown;
      try {
        rawInput = JSON.parse(options.input);
      } catch {
        console.error(pc.red("Invalid JSON input"));
        process.exit(1);
      }

      // Validate input against workflow schema
      const validation = workflow.inputSchema.safeParse(rawInput);
      if (!validation.success) {
        console.error(pc.red("Invalid workflow input:"));
        for (const issue of validation.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          console.error(pc.red(`  ${path}: ${issue.message}`));
        }
        process.exit(1);
      }
      const inputs = validation.data;

      // Build workflow registry from all discovered workflows
      const workflowRegistry: Record<string, unknown> = {};
      for (const w of workflows) {
        workflowRegistry[w.name] = w;
      }

      // Create 0pflow instance and run
      if (!options.json) {
        console.log(pc.dim(`Running ${workflowName}...`));
      }

      const pflow = await create0pflow({
        databaseUrl: process.env.DATABASE_URL!,
        workflows: workflowRegistry,
      });

      try {
        const result = await pflow.triggerWorkflow(workflow.name, inputs);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(pc.green("\nResult:"));
          console.log(JSON.stringify(result, null, 2));
        }
      } finally {
        await pflow.shutdown();
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });
```

**Step 2: Build and test manually**

Run:
```bash
cd packages/cli && pnpm build
cd ../../examples/uptime-app && npx 0pflow run url-check -i '{"url": "https://example.com"}'
```
Expected: Shows workflow result with status_code, response_time_ms, etc.

**Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): implement run command"
```

---

## Task 8: Implement `history` Command

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Add runs command**

```typescript
import { listRuns, getRun } from "./runs.js";
import Table from "cli-table3";

function formatStatus(status: string): string {
  switch (status) {
    case "SUCCESS":
      return pc.green(status);
    case "ERROR":
      return pc.red(status);
    case "PENDING":
      return pc.yellow(status);
    default:
      return status;
  }
}

program
  .command("history [run-id]")
  .description("List past workflow executions or get details of a specific run")
  .option("-n, --limit <number>", "Number of runs to show", "20")
  .option("-w, --workflow <name>", "Filter by workflow name")
  .option("--json", "Output as JSON")
  .action(async (runId: string | undefined, options: { limit: string; workflow?: string; json?: boolean }) => {
    try {
      resolveEnv();
      const databaseUrl = process.env.DATABASE_URL!;

      if (runId) {
        // Get specific run (supports full ID or prefix like git short hashes)
        const { run, ambiguous } = await getRun(databaseUrl, runId);

        if (ambiguous) {
          console.error(pc.red(`Ambiguous run ID prefix "${runId}" - matches multiple runs`));
          console.error(pc.dim("Use a longer prefix or the full ID"));
          process.exit(1);
        }

        if (!run) {
          console.error(pc.red(`Run "${runId}" not found`));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(run, null, 2));
        } else {
          const table = new Table();
          table.push(
            { [pc.dim("ID")]: run.workflow_uuid },
            { [pc.dim("Workflow")]: pc.cyan(run.name) },
            { [pc.dim("Status")]: formatStatus(run.status) },
            { [pc.dim("Created")]: new Date(run.created_at).toLocaleString() },
            { [pc.dim("Updated")]: new Date(run.updated_at).toLocaleString() },
          );
          if (run.output) {
            table.push({ [pc.dim("Output")]: JSON.stringify(run.output, null, 2) });
          }
          if (run.error) {
            table.push({ [pc.dim("Error")]: pc.red(run.error) });
          }
          console.log();
          console.log(table.toString());
          console.log();
        }
      } else {
        // List runs
        const runs = await listRuns(databaseUrl, {
          limit: parseInt(options.limit, 10),
          workflowName: options.workflow,
        });

        if (runs.length === 0) {
          if (options.json) {
            console.log("[]");
          } else {
            console.log(pc.yellow("No workflow runs found"));
          }
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(runs, null, 2));
        } else {
          const table = new Table({
            head: [pc.dim("ID"), pc.dim("Workflow"), pc.dim("Status"), pc.dim("Created")],
          });
          for (const run of runs) {
            table.push([
              run.workflow_uuid.slice(0, 8),
              pc.cyan(run.name),
              formatStatus(run.status),
              new Date(run.created_at).toLocaleString(),
            ]);
          }
          console.log();
          console.log(table.toString());
          console.log();
        }
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });
```

**Step 2: Build and test manually**

Run:
```bash
cd packages/cli && pnpm build
cd ../../examples/uptime-app && npx 0pflow history
cd ../../examples/uptime-app && npx 0pflow history <id-from-list>
```
Expected: Shows list of past executions, then details of specific run

**Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): implement history command"
```

---

## Task 9: Remove Compile Command

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Remove the compile command**

The compile command is handled by the Claude Code skill, not the CLI. Remove it from index.ts if it still exists.

**Step 2: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "chore(cli): remove compile command (handled by Claude Code skill)"
```

---

## Task 10: Final Integration Test

**Step 1: Build everything**

Run:
```bash
pnpm build
```

**Step 2: Test all commands from uptime-app**

```bash
cd examples/uptime-app

# List workflows
npx 0pflow list
npx 0pflow list --json

# Run a workflow
npx 0pflow run url-check -i '{"url": "https://example.com"}'
npx 0pflow run url-check -i '{"url": "https://example.com"}' --json

# List past executions
npx 0pflow history
npx 0pflow history --json
npx 0pflow history -n 5
npx 0pflow history -w url-check

# Get run details (use ID from above)
npx 0pflow history <run-id>
npx 0pflow history <run-id> --json
```

**Step 3: Update design doc**

Update `docs/plans/2026-01-23-0pflow-design.md` to mark Phase 6 CLI as Done.

**Step 4: Final commit**

```bash
git add docs/plans/2026-01-23-0pflow-design.md
git commit -m "docs: mark Phase 6 CLI as complete"
```
