import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";

/**
 * GET /api/cloud-dev/list
 * List all cloud dev machines for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const db = await getPool();
    const result = await db.query(
      `SELECT dm.app_name, dm.fly_app_name, dm.app_url, dm.machine_status, dmm.role
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1
       ORDER BY dm.created_at DESC`,
      [userId],
    );

    return NextResponse.json({
      data: result.rows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `List failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
