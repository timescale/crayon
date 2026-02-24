import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listMachines } from "@/lib/fly";

/**
 * GET /api/cloud-dev/list
 * List all cloud dev machines for the authenticated user, with live Fly state.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const db = await getPool();
    const result = await db.query(
      `SELECT dm.app_name, dm.fly_app_name, dm.app_url, dmm.role, dmm.linux_user
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1
       ORDER BY dm.created_at DESC`,
      [userId],
    );

    // Fetch live state from Fly in parallel for each machine
    const rows = await Promise.all(
      result.rows.map(async (row) => {
        let fly_state = "unknown";
        if (row.fly_app_name) {
          try {
            const machines = await listMachines(row.fly_app_name as string);
            fly_state = machines[0]?.state ?? "unknown";
          } catch {
            // Fly API unavailable — leave as unknown
          }
        }
        return { ...row, fly_state };
      }),
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    return NextResponse.json(
      {
        error: `List failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
