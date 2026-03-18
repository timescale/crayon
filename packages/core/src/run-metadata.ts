import type pg from "pg";

/**
 * Record per-run metadata (test mode, etc.) alongside DBOS workflow_status.
 * Uses ON CONFLICT DO NOTHING so duplicate calls are safe.
 */
export async function recordRunMetadata(
  pool: pg.Pool,
  schema: string,
  workflowUuid: string,
  testMode: boolean,
): Promise<void> {
  const table = `"${schema}".crayon_run_metadata`;
  await pool.query(
    `INSERT INTO ${table} (workflow_uuid, test_mode) VALUES ($1, $2)
     ON CONFLICT (workflow_uuid) DO NOTHING`,
    [workflowUuid, testMode],
  );
}
