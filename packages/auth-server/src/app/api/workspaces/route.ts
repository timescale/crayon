import { type NextRequest, NextResponse } from "next/server";
import { authenticateWebSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listMachines } from "@/lib/fly";

/**
 * GET /api/workspaces
 * Cookie-authenticated endpoint returning user info + workspace list with live Fly state.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateWebSession(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { userId } = auth;

  try {
    const db = await getPool();

    // Fetch user info
    const userResult = await db.query(
      `SELECT github_login, approved FROM users WHERE id = $1`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = {
      login: userResult.rows[0].github_login as string,
      approved: userResult.rows[0].approved as boolean,
    };

    // If not approved, return early with no workspaces
    if (!user.approved) {
      return NextResponse.json({ user, data: [] });
    }

    // Fetch workspaces
    const result = await db.query(
      `SELECT dm.app_name, dm.fly_app_name, dm.app_url, dmm.role
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1
       ORDER BY dm.created_at DESC`,
      [userId],
    );

    // Fetch live Fly state in parallel
    const rows = await Promise.all(
      result.rows.map(async (row) => {
        let fly_state = "unknown";
        if (row.fly_app_name) {
          try {
            const machines = await listMachines(row.fly_app_name as string);
            fly_state = machines[0]?.state ?? "unknown";
          } catch {
            // Fly API unavailable
          }
        }
        return { ...row, fly_state };
      }),
    );

    return NextResponse.json({ user, data: rows });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to list workspaces: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
