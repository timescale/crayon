// Kept in sync with packages/core/src/cli/mcp/lib/schema-ops.ts
import { randomBytes } from "node:crypto";

import pg from "pg";

function generatePassword(length = 24): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

function buildConnectionString(
  originalUrl: string,
  user: string,
  password: string,
): string {
  const parsed = new URL(originalUrl);
  parsed.username = user;
  parsed.password = encodeURIComponent(password);
  if (!parsed.searchParams.has("uselibpqcompat")) {
    parsed.searchParams.set("uselibpqcompat", "true");
  }
  return parsed.toString();
}

export interface SetupSchemaResult {
  DATABASE_URL: string;
  DATABASE_SCHEMA: string;
}

/**
 * Provision a PostgreSQL schema and role for an app in an existing database.
 *
 * Creates:
 *   - A role named `pgName` with LOGIN + a generated password
 *   - Schemas `pgName` and `pgName_dbos` owned by the role
 *   - Appropriate grants and search_path settings
 *
 * The `appName` parameter is sanitized into a valid PG identifier (`pgName`).
 * Throws if the role already exists — callers should check before calling.
 */
export async function setupSchemaFromUrl(
  adminConnectionString: string,
  appName: string,
): Promise<SetupSchemaResult> {
  // Sanitize into a valid PostgreSQL identifier
  const pgName = appName.replace(/[-. ]/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

  // Extract database name from URL for the GRANT CREATE ON DATABASE statement
  const dbName = new URL(adminConnectionString).pathname.slice(1) || "tsdb";

  const pool = new pg.Pool({ connectionString: adminConnectionString, max: 1 });

  try {
    const existingUser = await pool.query(
      `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`,
      [pgName],
    );

    if (existingUser.rows.length > 0) {
      throw new Error(
        `Role '${pgName}' already exists. Choose a different app name or delete the existing role.`,
      );
    }

    const appPassword = generatePassword();

    // Note: DDL statements like CREATE ROLE do not support parameterized
    // passwords in the pg wire protocol. pgName is sanitized to [a-zA-Z0-9_].
    await pool.query(
      `CREATE ROLE ${pgName} WITH LOGIN PASSWORD '${appPassword}'`,
    );

    await pool.query(`GRANT ${pgName} TO tsdbadmin WITH INHERIT TRUE`);

    await pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${pgName} AUTHORIZATION ${pgName}`,
    );
    await pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${pgName}_dbos AUTHORIZATION ${pgName}`,
    );

    await pool.query(`GRANT CREATE ON DATABASE ${dbName} TO ${pgName}`);

    await pool.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public`,
    );

    await pool.query(`REVOKE CREATE ON SCHEMA public FROM ${pgName}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${pgName}`);

    await pool.query(
      `ALTER ROLE ${pgName} SET search_path TO ${pgName}, ${pgName}_dbos, public`,
    );

    const appDatabaseUrl = buildConnectionString(
      adminConnectionString,
      pgName,
      appPassword,
    );

    return {
      DATABASE_URL: appDatabaseUrl,
      DATABASE_SCHEMA: pgName,
    };
  } finally {
    await pool.end();
  }
}
