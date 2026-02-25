import { getPool } from "./db";

export interface WorkspaceMembership {
  machineId: number;
  role: string;
}

/**
 * Verify that a user is a member of the given workspace.
 * Returns the membership record if valid, null otherwise.
 *
 * "workspace_id" maps to dev_machines.id (the numeric PK).
 */
export async function verifyWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  const db = await getPool();
  const result = await db.query(
    `SELECT dmm.machine_id, dmm.role
     FROM dev_machine_members dmm
     WHERE dmm.user_id = $1 AND dmm.machine_id = $2`,
    [userId, workspaceId],
  );

  if (result.rows.length === 0) return null;
  return {
    machineId: result.rows[0].machine_id as number,
    role: result.rows[0].role as string,
  };
}
