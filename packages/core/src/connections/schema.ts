import pg from "pg";

function connectionsTableSQL(schema: string): string {
  return `
CREATE TABLE IF NOT EXISTS "${schema}".crayon_connections (
  workflow_name TEXT NOT NULL,
  node_name TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_name, node_name, integration_id)
)`;
}

function runMetadataTableSQL(schema: string): string {
  return `
CREATE TABLE IF NOT EXISTS "${schema}".crayon_run_metadata (
  workflow_uuid TEXT PRIMARY KEY,
  test_mode BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
}

/**
 * Ensure all crayon-managed tables exist.
 * Creates a short-lived connection, runs DDL for each table, then closes it.
 * When schema is provided, tables are created in that schema explicitly
 * (avoids permission issues when a same-named table exists in public).
 */
export async function ensureCrayonTables(databaseUrl: string, schema: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(connectionsTableSQL(schema));
    await client.query(runMetadataTableSQL(schema));
  } finally {
    await client.end();
  }
}
