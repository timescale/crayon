import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { flyctlSync } from "@/lib/flyctl";

/**
 * POST /api/cloud-dev/destroy
 * Destroy a cloud dev machine and its Fly app.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await req.json()) as { appName?: string };
    if (!body.appName) {
      return NextResponse.json(
        { error: "appName is required" },
        { status: 400 },
      );
    }

    const { appName } = body;
    const db = await getPool();

    // Only the owner can destroy
    const result = await db.query(
      `SELECT dm.id, dm.fly_app_name
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2 AND dmm.role = 'owner'`,
      [userId, appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Machine not found or you are not the owner" },
        { status: 404 },
      );
    }

    const machineDbId = result.rows[0].id as number;
    const flyAppName = result.rows[0].fly_app_name as string;

    // Destroy the Fly app (cascades to machines and volumes)
    try {
      flyctlSync(["apps", "destroy", flyAppName, "-y"]);
    } catch (err) {
      console.log(
        `[cloud-dev/destroy] flyctl destroy warning: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Delete from DB (dev_machine_members cascade-deletes)
    await db.query(`DELETE FROM dev_machines WHERE id = $1`, [machineDbId]);

    return NextResponse.json({
      data: { status: "destroyed" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Destroy failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
