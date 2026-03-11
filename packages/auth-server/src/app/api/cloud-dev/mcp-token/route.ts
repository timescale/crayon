import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { signDevUIToken } from "@/lib/jwt";

/**
 * GET /api/cloud-dev/mcp-token?appName=X
 * Returns a signed dev-UI JWT for MCP HTTP transport authentication.
 * The token is verified by the dev server's Bearer auth on the machine.
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
      `SELECT dm.fly_app_name, dmm.linux_user
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

    const { fly_app_name, linux_user } = result.rows[0];

    const token = await signDevUIToken({
      sub: userId,
      app: fly_app_name as string,
      login: linux_user as string,
    });

    return NextResponse.json({ data: { token } });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
