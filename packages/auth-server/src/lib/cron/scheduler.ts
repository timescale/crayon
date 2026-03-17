import { getPool } from "@/lib/db";
import { computeNextRun } from "./next-run";
import { triggerWorkflow, pollRunStatus } from "./executor";

const TICK_INTERVAL_MS = 15_000;
const BATCH_SIZE = 10;
const POLL_TIMEOUT_HOURS = 1;
const MAX_CONSECUTIVE_FAILURES = 10;

let tickTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function startScheduler(): void {
  if (tickTimer) return;
  console.log("[cron] Scheduler started (tick every 15s)");
  tickTimer = setInterval(() => {
    tick().catch((err) => {
      console.error("[cron] Tick error:", err);
    });
  }, TICK_INTERVAL_MS);
  // Run first tick immediately
  tick().catch((err) => console.error("[cron] Initial tick error:", err));
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log("[cron] Scheduler stopped");
  }
}

interface ClaimedJob {
  id: number;
  machine_id: number;
  workflow_name: string;
  cron_expression: string;
  timezone: string;
  input: Record<string, unknown>;
  created_by: string;
  fly_app_name: string;
}

/**
 * Single tick: trigger due jobs, then poll pending runs.
 */
async function tick(): Promise<void> {
  if (ticking) return; // prevent overlapping ticks
  ticking = true;
  try {
    await triggerDueJobs();
    await pollPendingRuns();
  } finally {
    ticking = false;
  }
}

/**
 * Phase 1: Claim and trigger due cron jobs, one at a time.
 *
 * Each job is processed in its own transaction:
 *   BEGIN → lock 1 row → trigger HTTP → record result → advance next_run_at → COMMIT
 *
 * Only 1 row is locked at a time.  If the trigger fails, we rollback so
 * next_run_at stays unchanged and the job retries on the next tick.
 * If the process crashes after the HTTP call but before COMMIT, the
 * trigger already fired but next_run_at wasn't advanced — the job will
 * fire again (at-least-once semantics, acceptable for cron).
 */
async function triggerDueJobs(): Promise<void> {
  const db = await getPool();

  for (let i = 0; i < BATCH_SIZE; i++) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const claimed = await client.query<ClaimedJob>(
        `SELECT cj.id, cj.machine_id, cj.workflow_name, cj.cron_expression,
                cj.timezone, cj.input, cj.created_by,
                dm.fly_app_name
         FROM cron_jobs cj
         JOIN dev_machines dm ON dm.id = cj.machine_id
         WHERE cj.enabled = true AND cj.next_run_at <= NOW()
         ORDER BY cj.next_run_at ASC
         LIMIT 1
         FOR UPDATE OF cj SKIP LOCKED`,
      );

      if (claimed.rows.length === 0) {
        await client.query("COMMIT");
        break; // no more due jobs
      }

      const job = claimed.rows[0];

      // Compute next_run_at upfront (fast, pure computation)
      let nextRun: Date;
      try {
        nextRun = computeNextRun(job.cron_expression, job.timezone);
      } catch {
        console.error(`[cron] Invalid cron expression for job ${job.id}, disabling`);
        await client.query(
          `UPDATE cron_jobs SET enabled = false, updated_at = NOW() WHERE id = $1`,
          [job.id],
        );
        await client.query("COMMIT");
        continue;
      }

      // Trigger the workflow while holding the lock
      console.log(`[cron] Triggering job ${job.id} (${job.workflow_name} on ${job.fly_app_name})`);

      try {
        const result = await triggerWorkflow(
          job.fly_app_name,
          job.workflow_name,
          job.input,
          job.created_by,
        );

        // Record result + advance next_run_at, then commit atomically
        await client.query(
          `INSERT INTO cron_runs (job_id, status, run_id, http_status)
           VALUES ($1, $2, $3, $4)`,
          [
            job.id,
            result.httpStatus >= 200 && result.httpStatus < 300
              ? "triggered"
              : "error",
            result.runId,
            result.httpStatus,
          ],
        );

        await client.query(
          `UPDATE cron_jobs
           SET next_run_at = $1, last_run_at = NOW(), updated_at = NOW(),
               consecutive_failures = 0
           WHERE id = $2`,
          [nextRun, job.id],
        );

        await client.query("COMMIT");
      } catch (err) {
        // Trigger failed — rollback so next_run_at stays unchanged for retry
        await client.query("ROLLBACK").catch(() => {});

        // Record the failure and bump consecutive_failures outside the transaction
        const errorMsg = err instanceof Error ? err.message : String(err);
        await db.query(
          `INSERT INTO cron_runs (job_id, status, error)
           VALUES ($1, 'error', $2)`,
          [job.id, errorMsg],
        );
        await db.query(
          `UPDATE cron_jobs
           SET consecutive_failures = consecutive_failures + 1,
               enabled = CASE WHEN consecutive_failures + 1 >= $1 THEN false ELSE enabled END,
               updated_at = NOW()
           WHERE id = $2`,
          [MAX_CONSECUTIVE_FAILURES, job.id],
        );
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[cron] Unexpected error processing job:", err);
    } finally {
      client.release();
    }
  }
}

/**
 * Phase 2: Poll triggered runs to check if workflows completed.
 */
async function pollPendingRuns(): Promise<void> {
  const db = await getPool();

  const pending = await db.query<{
    id: number;
    run_id: string;
    started_at: Date;
    created_by: string;
    fly_app_name: string;
  }>(
    `SELECT cr.id, cr.run_id, cr.started_at, cj.created_by,
       dm.fly_app_name
     FROM cron_runs cr
     JOIN cron_jobs cj ON cj.id = cr.job_id
     JOIN dev_machines dm ON dm.id = cj.machine_id
     WHERE cr.status = 'triggered'
       AND cr.run_id IS NOT NULL
       AND cr.started_at > NOW() - INTERVAL '${POLL_TIMEOUT_HOURS} hours'
     ORDER BY cr.started_at ASC
     LIMIT 20`,
  );

  if (pending.rows.length === 0) return;

  await Promise.allSettled(
    pending.rows.map(async (run) => {
      const result = await pollRunStatus(
        run.fly_app_name,
        run.run_id,
        run.created_by,
      );

      if (!result) return; // machine unreachable, skip

      const now = new Date();
      const durationMs =
        now.getTime() - new Date(run.started_at).getTime();

      if (result.status === "SUCCESS") {
        await db.query(
          `UPDATE cron_runs SET status = 'success', finished_at = $1, duration_ms = $2
           WHERE id = $3`,
          [now, durationMs, run.id],
        );
      } else if (result.status === "ERROR") {
        await db.query(
          `UPDATE cron_runs SET status = 'error', finished_at = $1, duration_ms = $2, error = $3
           WHERE id = $4`,
          [now, durationMs, result.error, run.id],
        );
      }
      // If PENDING, leave as 'triggered' — will poll again next tick
    }),
  );

  // Timeout old triggered runs
  await db.query(
    `UPDATE cron_runs
     SET status = 'timeout', finished_at = NOW()
     WHERE status = 'triggered'
       AND started_at <= NOW() - INTERVAL '${POLL_TIMEOUT_HOURS} hours'`,
  );
}

// Export tick for testing
export { tick as _tick };
