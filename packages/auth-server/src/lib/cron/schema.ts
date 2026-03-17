import type pg from "pg";

export async function ensureCronSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      machine_id BIGINT NOT NULL REFERENCES dev_machines(id) ON DELETE CASCADE,
      workflow_name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      input JSONB NOT NULL DEFAULT '{}',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT NOT NULL REFERENCES users(id),
      next_run_at TIMESTAMPTZ NOT NULL,
      last_run_at TIMESTAMPTZ,
      consecutive_failures INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run
      ON cron_jobs(next_run_at) WHERE enabled = true
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      job_id BIGINT NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'triggered',
      run_id TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      http_status INT,
      error TEXT,
      duration_ms INT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cron_runs_job
      ON cron_runs(job_id, started_at DESC)
  `);
}
