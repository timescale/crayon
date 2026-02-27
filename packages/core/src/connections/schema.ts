import pg from "pg";

function createTableSQL(schema: string): string {
  const table = `"${schema}".ocrayon_connections`;
  return `
CREATE TABLE IF NOT EXISTS ${table} (
  workflow_name TEXT NOT NULL,
  node_name TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_name, node_name, integration_id)
)`;
}

/**
 * Ensure the ocrayon_connections table exists.
 * Creates a short-lived connection, runs the DDL, then closes it.
 * When schema is provided, the table is created in that schema explicitly
 * (avoids permission issues when a same-named table exists in public).
 */
export async function ensureConnectionsTable(databaseUrl: string, schema: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(createTableSQL(schema));
  } finally {
    await client.end();
  }
}
