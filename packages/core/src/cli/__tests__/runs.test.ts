// packages/cli/src/__tests__/runs.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { listRuns, getRun } from "../runs.js";
import { createCrayon, Workflow, Node, type Crayon } from "../../index.js";
import { ensureCrayonTables } from "../../connections/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
// Use a dedicated schema for runs tests
const TEST_APP_NAME = "runs_test";
const TEST_SCHEMA = "runs_test_dbos";

async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS runs_test CASCADE`);
  } finally {
    await client.end();
  }
  await ensureCrayonTables(DATABASE_URL!, TEST_APP_NAME);
}

const echoNode = Node.create({
  name: "echo",
  description: "Echoes input",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ message: z.string() }),
  execute: async (_ctx, inputs) => ({ message: inputs.message }),
});

const echoWorkflow = Workflow.create({
  name: "echo-workflow",
  description: "Echoes a message",
  version: 1,
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ message: z.string() }),
  run: async (ctx, inputs) => {
    return ctx.run(echoNode, { message: inputs.message });
  },
});

describe.skipIf(!DATABASE_URL)("runs", () => {
  let crayon: Crayon;

  beforeAll(async () => {
    process.env.DATABASE_SCHEMA = TEST_APP_NAME;
    await resetDatabase();

    crayon = await createCrayon({
      databaseUrl: DATABASE_URL!,
      appName: TEST_APP_NAME,
      workflows: { "echo-workflow": echoWorkflow },
      nodes: { echo: echoNode },
    });

    // Run a workflow so there's data to query
    const runId = randomUUID();
    await DBOS.withNextWorkflowID(runId, () =>
      crayon.triggerWorkflow("echo-workflow", { message: "hello" }, { runId, source: "cli" }),
    );
  }, 30000);

  afterAll(async () => {
    await crayon?.shutdown();
  });

  it("lists recent workflow runs", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 10, schema: TEST_SCHEMA });
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]).toHaveProperty("workflow_uuid");
    expect(runs[0]).toHaveProperty("name");
    expect(runs[0]).toHaveProperty("status");
  });

  it("gets a specific run by full id", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1, schema: TEST_SCHEMA });
    expect(runs.length).toBeGreaterThan(0);
    const result = await getRun(DATABASE_URL!, runs[0].workflow_uuid, TEST_SCHEMA);
    expect(result.run).not.toBeNull();
    expect(result.run!.workflow_uuid).toBe(runs[0].workflow_uuid);
    expect(result.ambiguous).toBeUndefined();
  });

  it("gets a specific run by id prefix", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1, schema: TEST_SCHEMA });
    expect(runs.length).toBeGreaterThan(0);
    // Use first 8 characters as prefix (like displayed in history)
    const prefix = runs[0].workflow_uuid.slice(0, 8);
    const result = await getRun(DATABASE_URL!, prefix, TEST_SCHEMA);
    // Should find the run (may be ambiguous if multiple runs share prefix)
    if (!result.ambiguous) {
      expect(result.run).not.toBeNull();
      expect(result.run!.workflow_uuid.startsWith(prefix)).toBe(true);
    }
  });

  it("returns null for non-existent run", async () => {
    const result = await getRun(DATABASE_URL!, "non-existent-id", TEST_SCHEMA);
    expect(result.run).toBeNull();
    expect(result.ambiguous).toBeUndefined();
  });

  it("records test_mode and source metadata for workflow runs", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1, schema: TEST_SCHEMA });
    expect(runs.length).toBeGreaterThan(0);
    // The workflow was triggered with default testMode (true) and source "cli"
    expect(runs[0].test_mode).toBe(true);
    expect(runs[0].source).toBe("cli");
  });

  it("records test_mode=false for live runs", async () => {
    const liveId = randomUUID();
    await DBOS.withNextWorkflowID(liveId, () =>
      crayon.triggerWorkflow("echo-workflow", { message: "live" }, { runId: liveId, testMode: false, source: "webhook" }),
    );
    const result = await getRun(DATABASE_URL!, liveId, TEST_SCHEMA);
    expect(result.run).not.toBeNull();
    expect(result.run!.test_mode).toBe(false);
    expect(result.run!.source).toBe("webhook");
  });

  it("duplicate runId metadata inserts are ignored", async () => {
    const dupId = randomUUID();
    // First trigger — test mode (default)
    await DBOS.withNextWorkflowID(dupId, () =>
      crayon.triggerWorkflow("echo-workflow", { message: "first" }, { runId: dupId }),
    );
    // Second trigger with same runId — ON CONFLICT DO NOTHING preserves original
    await DBOS.withNextWorkflowID(dupId, () =>
      crayon.triggerWorkflow("echo-workflow", { message: "second" }, { runId: dupId, testMode: false }),
    );
    const result = await getRun(DATABASE_URL!, dupId, TEST_SCHEMA);
    expect(result.run).not.toBeNull();
    // Original test_mode (true) should be preserved
    expect(result.run!.test_mode).toBe(true);
  });
});
