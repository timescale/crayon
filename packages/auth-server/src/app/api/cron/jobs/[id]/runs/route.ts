import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { verifyJobAccess } from "@/lib/cron";

/**
 * GET /api/cron/jobs/[id]/runs — List execution history for a cron job.
 * Query params: ?limit=20
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await params;

  try {
    const job = await verifyJobAccess(id, userId);
    if (!job) {
      return NextResponse.json(
        { error: "Cron job not found or not authorized" },
        { status: 404 },
      );
    }

    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10),
      100,
    );

    const db = await getPool();
    const result = await db.query(
      `SELECT * FROM cron_runs
       WHERE job_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [id, limit],
    );

    return NextResponse.json({ data: result.rows });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to list cron runs: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
