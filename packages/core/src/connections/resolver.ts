import pg from "pg";

export interface ConnectionMapping {
  workflow_name: string;
  node_name: string;
  integration_id: string;
  connection_id: string;
  updated_at?: Date;
}

/** Schema-qualified table reference for crayon_connections */
function table(schema: string): string {
  return `"${schema}".crayon_connections`;
}

/**
 * Resolve a connection ID for a given workflow/node/integration.
 * Checks for an exact match first, then falls back to global defaults (* / *).
 */
export async function resolveConnectionId(
  pool: pg.Pool,
  workflowName: string,
  nodeName: string,
  integrationId: string,
  schema: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT connection_id FROM ${table(schema)}
    WHERE integration_id = $1
      AND (
        (workflow_name = $2 AND node_name = $3)
        OR (workflow_name = '*' AND node_name = '*')
      )
    ORDER BY
      CASE WHEN workflow_name = '*' AND node_name = '*' THEN 1 ELSE 0 END
    LIMIT 1`,
    [integrationId, workflowName, nodeName],
  );
  return result.rows.length > 0 ? (result.rows[0].connection_id as string) : null;
}

/**
 * Upsert a connection mapping.
 */
export async function upsertConnection(
  pool: pg.Pool,
  mapping: Omit<ConnectionMapping, "updated_at">,
  schema: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO ${table(schema)} (workflow_name, node_name, integration_id, connection_id, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (workflow_name, node_name, integration_id)
    DO UPDATE SET connection_id = EXCLUDED.connection_id, updated_at = NOW()`,
    [mapping.workflow_name, mapping.node_name, mapping.integration_id, mapping.connection_id],
  );
}

/**
 * List all connection mappings.
 */
export async function listConnections(pool: pg.Pool, schema: string): Promise<ConnectionMapping[]> {
  const result = await pool.query(
    `SELECT workflow_name, node_name, integration_id, connection_id, updated_at
    FROM ${table(schema)}
    ORDER BY workflow_name, node_name, integration_id`,
  );
  return result.rows as ConnectionMapping[];
}

/**
 * Delete a connection mapping.
 */
export async function deleteConnection(
  pool: pg.Pool,
  workflowName: string,
  nodeName: string,
  integrationId: string,
  schema: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM ${table(schema)}
    WHERE workflow_name = $1
      AND node_name = $2
      AND integration_id = $3`,
    [workflowName, nodeName, integrationId],
  );
}
