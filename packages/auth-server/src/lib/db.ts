import pg from "pg";

let pool: pg.Pool | null = null;
let schemaReady = false;

export async function getPool(): Promise<pg.Pool> {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  if (!schemaReady) {
    await ensureSchema();
    schemaReady = true;
  }
  return pool;
}

/**
 * Create the required tables if they don't exist.
 */
async function ensureSchema(): Promise<void> {
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id TEXT UNIQUE NOT NULL,
      github_login TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool!.query(`
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
  await pool!.query(`
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_code ON cli_auth_sessions(code)
  `);
  await pool!.query(`
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_token ON cli_auth_sessions(session_token)
  `);

  // Deployments table — tracks Fly apps per user/app
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id TEXT NOT NULL REFERENCES users(id),
      app_name TEXT NOT NULL,
      fly_app_name TEXT,
      app_url TEXT,
      deploy_status TEXT DEFAULT 'idle',
      deploy_error TEXT,
      deploy_commit TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, app_name)
    )
  `);
  await pool!.query(`
    CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id)
  `);

  // Cloud dev machines — shared resource, not tied to a single user
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS dev_machines (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      app_name TEXT NOT NULL UNIQUE,
      fly_app_name TEXT,
      app_url TEXT,
      ssh_private_key TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Drop stale status columns if they exist (one-time migration)
  await pool!.query(`
    ALTER TABLE dev_machines
      DROP COLUMN IF EXISTS machine_status,
      DROP COLUMN IF EXISTS machine_error
  `);

  // Add SSH private key column (migration for existing tables)
  await pool!.query(`
    ALTER TABLE dev_machines
      ADD COLUMN IF NOT EXISTS ssh_private_key TEXT
  `);

  // Many users can access one machine
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS dev_machine_members (
      machine_id BIGINT NOT NULL REFERENCES dev_machines(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      linux_user TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (machine_id, user_id)
    )
  `);
}
