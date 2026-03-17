import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { computeNextRun, validateCronExpression, verifyMachineAccess } from "@/lib/cron";
import { CreateCronJobRequest } from "crayon/cron-schemas";

/**
 * POST /api/cron/jobs — Create a cron job for a machine.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await req.json();
    const parsed = CreateCronJobRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { flyAppName, workflowName, cronExpression, timezone, input } =
      parsed.data;

    if (!validateCronExpression(cronExpression)) {
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 },
      );
    }

    const machineId = await verifyMachineAccess(flyAppName, userId);
    if (!machineId) {
      return NextResponse.json(
        { error: "Machine not found or not a member" },
        { status: 404 },
      );
    }

    const db = await getPool();
    const nextRunAt = computeNextRun(cronExpression, timezone);

    const result = await db.query(
      `INSERT INTO cron_jobs (machine_id, workflow_name, cron_expression, timezone, input, created_by, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [machineId, workflowName, cronExpression, timezone, JSON.stringify(input), userId, nextRunAt],
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (err) {
    // Handle unique constraint violation
    if (
      err instanceof Error &&
      err.message.includes("unique")
    ) {
      return NextResponse.json(
        { error: "A cron job for this workflow already exists on this machine" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: `Failed to create cron job: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cron/jobs — List cron jobs.
 * Optional query: ?flyAppName=X to filter by machine.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const flyAppName = req.nextUrl.searchParams.get("flyAppName");
    const db = await getPool();

    let query = `
      SELECT cj.*, dm.fly_app_name, dm.app_name
      FROM cron_jobs cj
      JOIN dev_machines dm ON dm.id = cj.machine_id
      JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
      WHERE dmm.user_id = $1
    `;
    const params: (string | number)[] = [userId];

    if (flyAppName) {
      params.push(flyAppName);
      query += ` AND dm.fly_app_name = $${params.length}`;
    }

    query += ` ORDER BY cj.created_at DESC`;

    const result = await db.query(query, params);
    return NextResponse.json({ data: result.rows });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to list cron jobs: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
