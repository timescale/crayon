import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getReadyPool } from "@/lib/db";
import { dbosApiCall } from "@/lib/dbos-cloud";

/**
 * GET /api/deploy/logs?appName=X
 *
 * Returns application logs by proxying to DBOS Cloud.
 *
 * Returns: { data: { logs } }
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const appName = new URL(req.url).searchParams.get("appName");
    if (!appName) {
      return NextResponse.json(
        { error: "Missing appName query parameter" },
        { status: 400 },
      );
    }

    const db = await getReadyPool();

    // Look up deployment record and verify ownership
    const result = await db.query(
      `SELECT dbos_app_name FROM deployments
       WHERE user_id = $1 AND app_name = $2`,
      [auth.userId, appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 },
      );
    }

    const dbosAppName = result.rows[0].dbos_app_name as string;

    // Proxy to DBOS Cloud
    const logs = await dbosApiCall("GET", `/applications/${dbosAppName}/logs`);

    return NextResponse.json({ data: { logs } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch logs" },
      { status: 500 },
    );
  }
}
