import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { signWebhookToken } from "@/lib/jwt";

const ALLOWED_DURATIONS = ["7d", "30d", "90d", "365d"] as const;
const DEFAULT_DURATION = "365d";

/**
 * POST /api/cloud-dev/webhook-token
 * Generate a long-lived JWT for webhook/external callers.
 * Body: { appName: string, expiresIn?: "7d" | "30d" | "90d" | "365d" }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await req.json()) as {
      appName?: string;
      expiresIn?: string;
    };

    if (!body.appName) {
      return NextResponse.json(
        { error: "appName is required" },
        { status: 400 },
      );
    }

    const expiresIn = body.expiresIn ?? DEFAULT_DURATION;
    if (!ALLOWED_DURATIONS.includes(expiresIn as (typeof ALLOWED_DURATIONS)[number])) {
      return NextResponse.json(
        { error: `expiresIn must be one of: ${ALLOWED_DURATIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const db = await getPool();
    const result = await db.query(
      `SELECT dm.fly_app_name, dmm.linux_user
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       WHERE dmm.user_id = $1 AND dm.app_name = $2`,
      [userId, body.appName],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Machine not found or access denied" },
        { status: 404 },
      );
    }

    const { fly_app_name, linux_user } = result.rows[0];

    const token = await signWebhookToken(
      {
        sub: userId,
        app: fly_app_name as string,
        login: linux_user as string,
      },
      expiresIn,
    );

    // Compute expiration date for display
    const days = parseInt(expiresIn);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    return NextResponse.json({ data: { token, expiresAt } });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
