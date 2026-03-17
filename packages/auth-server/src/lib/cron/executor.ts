import { signDevUIToken } from "@/lib/jwt";
import { getPool } from "@/lib/db";

const TRIGGER_TIMEOUT_MS = 60_000;

interface TriggerResult {
  httpStatus: number;
  runId: string | null;
  error: string | null;
}

/**
 * Trigger an async workflow execution on a machine.
 * Calls POST /dev/api/workflows/{name}/start which returns immediately with a runId.
 */
export async function triggerWorkflow(
  flyAppName: string,
  workflowName: string,
  input: Record<string, unknown>,
  createdBy: string,
): Promise<TriggerResult> {
  const db = await getPool();
  const userResult = await db.query(
    `SELECT github_login FROM users WHERE id = $1`,
    [createdBy],
  );
  const login =
    (userResult.rows[0]?.github_login as string) ?? "cron-system";

  const jwt = await signDevUIToken({
    sub: createdBy,
    app: flyAppName,
    login,
  });

  const url = `https://${flyAppName}.fly.dev/dev/api/workflows/${encodeURIComponent(workflowName)}/start`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as {
    runId?: string;
  } | null;

  return {
    httpStatus: response.status,
    runId: body?.runId ?? null,
    error: response.ok ? null : `HTTP ${response.status}`,
  };
}

interface PollResult {
  status: string; // DBOS workflow status: SUCCESS, ERROR, PENDING, etc.
  error: string | null;
}

/**
 * Poll a workflow run's status on a machine.
 * Calls GET /dev/api/runs/{runId} for lightweight status check.
 */
export async function pollRunStatus(
  flyAppName: string,
  runId: string,
  createdBy: string,
): Promise<PollResult | null> {
  const db = await getPool();
  const userResult = await db.query(
    `SELECT github_login FROM users WHERE id = $1`,
    [createdBy],
  );
  const login =
    (userResult.rows[0]?.github_login as string) ?? "cron-system";

  const jwt = await signDevUIToken({
    sub: createdBy,
    app: flyAppName,
    login,
  });

  const url = `https://${flyAppName}.fly.dev/dev/api/runs/${encodeURIComponent(runId)}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      status?: string;
      error?: string;
    };
    return {
      status: body.status ?? "UNKNOWN",
      error: body.error ?? null,
    };
  } catch {
    // Machine may be asleep or unreachable — skip this poll
    return null;
  }
}
