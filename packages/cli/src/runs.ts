// packages/cli/src/runs.ts
import pg from "pg";
import { getSchemaName } from "0pflow";
import { getAppName } from "./app.js";

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
  schema?: string;
}

/**
 * List recent workflow runs from DBOS tables
 */
export async function listRuns(
  databaseUrl: string,
  options: ListRunsOptions = {}
): Promise<WorkflowRun[]> {
  const { limit = 20, workflowName, schema: schemaOverride } = options;
  const schema = schemaOverride ?? getSchemaName(getAppName());
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    let query = `
      SELECT workflow_uuid, name, status, created_at, updated_at, output, error
      FROM ${schema}.workflow_status
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
  runId: string,
  schemaOverride?: string
): Promise<GetRunResult> {
  const schema = schemaOverride ?? getSchemaName(getAppName());
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    // Try exact match first
    const exact = await client.query(
      `SELECT workflow_uuid, name, status, created_at, updated_at, output, error
       FROM ${schema}.workflow_status
       WHERE workflow_uuid = $1`,
      [runId]
    );

    if (exact.rows[0]) {
      return { run: exact.rows[0] };
    }

    // Try prefix match (like git short hashes)
    const prefix = await client.query(
      `SELECT workflow_uuid, name, status, created_at, updated_at, output, error
       FROM ${schema}.workflow_status
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
