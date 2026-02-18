import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getReadyPool } from "@/lib/db";
import { dbosApiCall } from "@/lib/dbos-cloud";

/**
 * GET /api/deploy/status?appName=X
 *
 * Returns the deployment status by proxying to DBOS Cloud.
 *
 * Returns: { data: { status, appUrl, version } }
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
    const appInfo = (await dbosApiCall(
      "GET",
      `/applications/${dbosAppName}`,
    )) as {
      Status?: string;
      ApplicationDatabaseHost?: string;
      AppURL?: string;
      ApplicationVersion?: string;
    } | null;

    // Update app URL in our records if available
    if (appInfo?.AppURL) {
      await db.query(
        `UPDATE deployments SET app_url = $1, updated_at = NOW()
         WHERE user_id = $2 AND app_name = $3`,
        [appInfo.AppURL, auth.userId, appName],
      );
    }

    return NextResponse.json({
      data: {
        status: appInfo?.Status ?? "UNKNOWN",
        appUrl: appInfo?.AppURL ?? null,
        version: appInfo?.ApplicationVersion ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 },
    );
  }
}
