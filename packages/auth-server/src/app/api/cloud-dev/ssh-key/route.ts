import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";

/**
 * GET /api/cloud-dev/ssh-key?appName=X
 * Fetch SSH private key and connection info for a cloud dev machine.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const appName = req.nextUrl.searchParams.get("appName");
  if (!appName) {
    return NextResponse.json(
      { error: "appName query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const db = await getPool();
    const result = await db.query(
      `SELECT dm.fly_app_name, dm.ssh_private_key, dmm.linux_user
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2`,
      [userId, appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Machine not found or access denied" },
        { status: 404 },
      );
    }

    const row = result.rows[0];

    if (!row.ssh_private_key) {
      return NextResponse.json(
        { error: "No SSH key available for this machine (created before SSH support)" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        privateKey: row.ssh_private_key as string,
        linuxUser: row.linux_user as string,
        host: `${row.fly_app_name as string}.fly.dev`,
        port: 2222,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
