import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listMachines, stopMachine } from "@/lib/fly";

/**
 * POST /api/cloud-dev/stop
 * Stop a cloud dev machine.
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

    const result = await db.query(
      `SELECT dm.fly_app_name
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2`,
      [userId, appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Machine not found" },
        { status: 404 },
      );
    }

    const flyAppName = result.rows[0].fly_app_name as string;

    // Stop all machines for this app
    const machines = await listMachines(flyAppName);
    for (const machine of machines) {
      if (
        machine.state === "started" ||
        machine.state === "running" ||
        machine.state === "starting"
      ) {
        await stopMachine(flyAppName, machine.id);
      }
    }

    return NextResponse.json({
      data: { status: "stopped" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Stop failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
