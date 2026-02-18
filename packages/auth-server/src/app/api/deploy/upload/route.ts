import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getReadyPool } from "@/lib/db";
import { dbosApiCall } from "@/lib/dbos-cloud";

/**
 * POST /api/deploy/upload
 *
 * Receives a base64-encoded ZIP and forwards it to DBOS Cloud.
 * The DBOS Cloud token never leaves the server.
 *
 * Body: { appName, archive }
 * Returns: { data: { version } }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as {
      appName?: string;
      archive?: string;
    };

    if (!body.appName || !body.archive) {
      return NextResponse.json(
        { error: "Missing required fields: appName, archive" },
        { status: 400 },
      );
    }

    const db = await getReadyPool();

    // Look up deployment record and verify ownership
    const result = await db.query(
      `SELECT dbos_app_name FROM deployments
       WHERE user_id = $1 AND app_name = $2`,
      [auth.userId, body.appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Deployment not found. Run prepare first." },
        { status: 404 },
      );
    }

    const dbosAppName = result.rows[0].dbos_app_name as string;

    // Forward to DBOS Cloud
    const deployResult = (await dbosApiCall(
      "POST",
      `/applications/${dbosAppName}`,
      { application_archive: body.archive },
    )) as { ApplicationVersion?: string } | null;

    // Update deployment record
    await db.query(
      `UPDATE deployments SET updated_at = NOW()
       WHERE user_id = $1 AND app_name = $2`,
      [auth.userId, body.appName],
    );

    return NextResponse.json({
      data: { version: deployResult?.ApplicationVersion ?? "unknown" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
