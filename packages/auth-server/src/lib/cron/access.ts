import { getPool } from "@/lib/db";

/**
 * Verify the user is a member of the machine that owns a cron job.
 * Returns the job row (with fly_app_name, app_name) or null.
 */
export async function verifyJobAccess(
  jobId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const db = await getPool();
  const result = await db.query(
    `SELECT cj.*, dm.fly_app_name, dm.app_name
     FROM cron_jobs cj
     JOIN dev_machines dm ON dm.id = cj.machine_id
     JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
     WHERE cj.id = $1 AND dmm.user_id = $2`,
    [jobId, userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Verify the user is a member of a machine identified by flyAppName.
 * Returns the machine_id or null.
 */
export async function verifyMachineAccess(
  flyAppName: string,
  userId: string,
): Promise<number | null> {
  const db = await getPool();
  const result = await db.query(
    `SELECT dm.id AS machine_id
     FROM dev_machines dm
     JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
     WHERE dmm.user_id = $1 AND dm.fly_app_name = $2`,
    [userId, flyAppName],
  );
  return (result.rows[0]?.machine_id as number) ?? null;
}
