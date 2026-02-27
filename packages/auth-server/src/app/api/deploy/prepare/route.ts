import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { flyctlSync } from "@/lib/flyctl";

const FLY_ORG = process.env.FLY_ORG ?? "tiger-data";

/**
 * POST /api/deploy/prepare
 * Create or retrieve a Fly app for the user's deployment.
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

    // Check for existing deployment with a Fly app already created
    const existing = await db.query(
      `SELECT fly_app_name, app_url FROM deployments
       WHERE user_id = $1 AND app_name = $2 AND fly_app_name IS NOT NULL`,
      [userId, appName],
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({
        data: { appUrl: existing.rows[0].app_url as string },
      });
    }

    // Reserve an ID from the sequence (no row inserted yet)
    const seqResult = await db.query(`SELECT nextval('deployments_id_seq') AS id`);
    const deploymentId = seqResult.rows[0].id as number;
    const flyAppName = `crayon-${deploymentId}`;
    const appUrl = `https://${flyAppName}.fly.dev`;

    // Create Fly app first — if this fails, no DB row is left behind
    console.log(`[deploy/prepare] Creating Fly app: ${flyAppName}`);
    flyctlSync(["apps", "create", flyAppName, "--org", FLY_ORG]);

    // Allocate shared IPv4
    try {
      flyctlSync(["ips", "allocate-v4", "--shared", "-a", flyAppName]);
    } catch (err) {
      console.log(`[deploy/prepare] IP allocation warning: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Insert complete row only after Fly app is confirmed created
    await db.query(
      `INSERT INTO deployments (id, user_id, app_name, fly_app_name, app_url)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5)`,
      [deploymentId, userId, appName, flyAppName, appUrl],
    );

    return NextResponse.json({
      data: { appUrl },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Prepare failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
