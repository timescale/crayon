import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listMachines } from "@/lib/fly";

/**
 * GET /api/cloud-dev/status?appName=X
 * Check cloud dev machine status.
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
      `SELECT dm.fly_app_name, dm.app_url, dm.machine_status, dm.machine_error
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2`,
      [userId, appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        data: { status: "not_found" },
      });
    }

    const flyAppName = result.rows[0].fly_app_name as string | null;
    const appUrl = result.rows[0].app_url as string | null;
    const machineError = result.rows[0].machine_error as string | null;

    if (!flyAppName) {
      return NextResponse.json({
        data: { status: "not_found" },
      });
    }

    // Check machine state via Fly Machines API
    try {
      const machines = await listMachines(flyAppName);
      if (machines.length === 0) {
        return NextResponse.json({
          data: { status: "creating", url: appUrl },
        });
      }

      const machine = machines[0];
      const state = machine.state?.toLowerCase();
      console.log(
        `[cloud-dev/status] ${appName}: machine ${machine.id} state=${state}`,
      );

      if (state === "started" || state === "running") {
        // Ping the app URL to verify it responds
        try {
          const resp = await fetch(appUrl!, {
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok || resp.status < 500) {
            // Update DB status
            await db.query(
              `UPDATE dev_machines SET machine_status = 'running', updated_at = NOW()
               WHERE fly_app_name = $1`,
              [flyAppName],
            );
            return NextResponse.json({
              data: { status: "running", url: appUrl },
            });
          }
        } catch {
          // App not responding yet — still starting
        }
        return NextResponse.json({
          data: { status: "starting", url: appUrl },
        });
      }

      if (state === "stopped" || state === "suspended") {
        return NextResponse.json({
          data: { status: "stopped", url: appUrl },
        });
      }

      if (state === "created" || state === "starting") {
        return NextResponse.json({
          data: { status: "starting", url: appUrl },
        });
      }

      // Other states
      return NextResponse.json({
        data: { status: state ?? "unknown", url: appUrl },
      });
    } catch (err) {
      console.log(
        `[cloud-dev/status] Machine check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return NextResponse.json({
        data: {
          status: "error",
          error: machineError ?? "Failed to check machine state",
          url: appUrl,
        },
      });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Status check failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
