import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { computeNextRun, validateCronExpression, verifyJobAccess } from "@/lib/cron";
import { UpdateCronJobRequest } from "crayon/cron-schemas";

/**
 * PATCH /api/cron/jobs/[id] — Update a cron job.
 */
export async function PATCH(
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

    const body = await req.json();
    const parsed = UpdateCronJobRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const updates = parsed.data;

    if (updates.cronExpression && !validateCronExpression(updates.cronExpression)) {
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 },
      );
    }

    const db = await getPool();

    // Build dynamic UPDATE
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.cronExpression !== undefined) {
      setClauses.push(`cron_expression = $${paramIdx++}`);
      values.push(updates.cronExpression);
    }
    if (updates.timezone !== undefined) {
      setClauses.push(`timezone = $${paramIdx++}`);
      values.push(updates.timezone);
    }
    if (updates.input !== undefined) {
      setClauses.push(`input = $${paramIdx++}`);
      values.push(JSON.stringify(updates.input));
    }
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIdx++}`);
      values.push(updates.enabled);
    }

    // Recompute next_run_at if schedule or timezone changed
    const cronExpr =
      updates.cronExpression ?? (job.cron_expression as string);
    const tz = updates.timezone ?? (job.timezone as string);
    const nextRun = computeNextRun(cronExpr, tz);
    setClauses.push(`next_run_at = $${paramIdx++}`);
    values.push(nextRun);

    values.push(id);
    const result = await db.query(
      `UPDATE cron_jobs SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    return NextResponse.json({ data: result.rows[0] });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to update cron job: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/cron/jobs/[id] — Delete a cron job.
 */
export async function DELETE(
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

    const db = await getPool();
    await db.query(`DELETE FROM cron_jobs WHERE id = $1`, [id]);

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to delete cron job: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
