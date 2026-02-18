import pg from "pg";

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

/**
 * Ensure database schema exists. Runs once per process (cached).
 * Called automatically by getReadyPool().
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = _ensureSchema();
  return schemaReady;
}

/**
 * Returns a pool after ensuring the schema is ready.
 * Preferred over calling getPool() + ensureSchema() separately.
 */
export async function getReadyPool(): Promise<pg.Pool> {
  await ensureSchema();
  return getPool();
}

async function _ensureSchema(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id TEXT UNIQUE NOT NULL,
      github_login TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cli_auth_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT UNIQUE NOT NULL,
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      user_id TEXT REFERENCES users(id),
      session_token TEXT UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes for lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_code ON cli_auth_sessions(code)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_token ON cli_auth_sessions(session_token)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_name TEXT NOT NULL,
      dbos_app_name TEXT NOT NULL UNIQUE,
      dbos_db_name TEXT NOT NULL UNIQUE,
      app_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, app_name)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id)
  `);
}
