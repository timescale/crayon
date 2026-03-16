import { type NextRequest, NextResponse } from "next/server";
import { authenticateWebSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { signDevUIToken } from "@/lib/jwt";

/**
 * GET /api/workspaces/open?app=<fly_app_name>
 * Seamlessly signs a JWT and redirects to the machine's dev-ui.
 * Eliminates the second GitHub OAuth round-trip.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateWebSession(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { userId } = auth;

  const flyAppName = req.nextUrl.searchParams.get("app");
  if (!flyAppName) {
    return NextResponse.json(
      { error: "app query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const db = await getPool();

    // Check user is approved
    const userResult = await db.query(
      `SELECT github_login, approved FROM users WHERE id = $1`,
      [userId],
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].approved) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const login = userResult.rows[0].github_login as string;

    // Check membership
    const memberResult = await db.query(
      `SELECT dmm.role
       FROM dev_machine_members dmm
       JOIN dev_machines dm ON dm.id = dmm.machine_id
       WHERE dm.fly_app_name = $1 AND dmm.user_id = $2`,
      [flyAppName, userId],
    );

    if (memberResult.rows.length === 0) {
      return NextResponse.json(
        { error: "You are not a member of this workspace" },
        { status: 403 },
      );
    }

    // Sign JWT and redirect
    const jwt = await signDevUIToken({
      sub: userId,
      app: flyAppName,
      login,
    });

    const callbackParams = new URLSearchParams({ token: jwt });
    // Pass through claude-code-panel param if present
    const claudeCodePanel = req.nextUrl.searchParams.get("claude-code-panel");
    if (claudeCodePanel) callbackParams.set("claude-code-panel", claudeCodePanel);
    const callbackUrl = `https://${flyAppName}.fly.dev/dev/__auth/callback?${callbackParams}`;
    return NextResponse.redirect(callbackUrl);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to open workspace: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
