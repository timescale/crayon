import type { IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type pg from "pg";
import {
  listConnections,
  upsertConnection,
  deleteConnection,
} from "../connections/index.js";
import type { IntegrationProvider } from "../connections/integration-provider.js";
import { parseOutput } from "../cli/trace.js";

const execFileAsync = promisify(execFile);

export interface ApiContext {
  pool: pg.Pool;
  integrationProvider: IntegrationProvider;
  /** DBOS system schema (e.g. my_app_dbos) for workflow_status queries */
  schema: string;
  /** App schema where opflow_connections lives (e.g. my_app) */
  appSchema: string;
  /** Project root directory for CLI subprocess execution */
  projectRoot: string;
  /** Workspace ID for cloud mode (from WORKSPACE_ID env var) */
  workspaceId?: string;
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Handle API requests. Returns true if the request was handled, false otherwise.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<boolean> {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS" && url.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  // GET /api/connections
  if (url === "/api/connections" && method === "GET") {
    const connections = await listConnections(ctx.pool, ctx.appSchema);
    jsonResponse(res, 200, connections);
    return true;
  }

  // PUT /api/connections
  if (url === "/api/connections" && method === "PUT") {
    const body = (await parseBody(req)) as {
      workflow_name?: string;
      node_name?: string;
      integration_id?: string;
      connection_id?: string;
    };
    if (!body.integration_id || !body.connection_id) {
      jsonResponse(res, 400, { error: "integration_id and connection_id are required" });
      return true;
    }
    await upsertConnection(ctx.pool, {
      workflow_name: body.workflow_name ?? "*",
      node_name: body.node_name ?? "*",
      integration_id: body.integration_id,
      connection_id: body.connection_id,
    }, ctx.appSchema);
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  // DELETE /api/connections
  if (url === "/api/connections" && method === "DELETE") {
    const body = (await parseBody(req)) as {
      workflow_name?: string;
      node_name?: string;
      integration_id?: string;
    };
    if (!body.integration_id) {
      jsonResponse(res, 400, { error: "integration_id is required" });
      return true;
    }
    await deleteConnection(
      ctx.pool,
      body.workflow_name ?? "*",
      body.node_name ?? "*",
      body.integration_id,
      ctx.appSchema,
    );
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  // GET /api/nango/integrations — list available integrations
  if (url === "/api/nango/integrations" && method === "GET") {
    try {
      const integrations = await ctx.integrationProvider.listIntegrations();
      jsonResponse(res, 200, integrations);
    } catch (err) {
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : "Failed to list integrations",
      });
    }
    return true;
  }

  // GET /api/nango/connections/:integrationId
  const nangoConnectionsMatch = url.match(/^\/api\/nango\/connections\/([^/]+)$/);
  if (nangoConnectionsMatch && method === "GET") {
    const integrationId = decodeURIComponent(nangoConnectionsMatch[1]);
    try {
      const connections = await ctx.integrationProvider.listConnections(integrationId, ctx.workspaceId);
      jsonResponse(res, 200, connections);
    } catch (err) {
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : "Failed to list connections",
      });
    }
    return true;
  }

  // POST /api/nango/connect-session
  if (url === "/api/nango/connect-session" && method === "POST") {
    const body = (await parseBody(req)) as {
      integration_id?: string;
    };
    if (!body.integration_id) {
      jsonResponse(res, 400, { error: "integration_id is required" });
      return true;
    }
    try {
      const session = await ctx.integrationProvider.createConnectSession(body.integration_id, ctx.workspaceId);
      jsonResponse(res, 200, session);
    } catch (err) {
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : "Failed to create connect session",
      });
    }
    return true;
  }

  // ---- Run History endpoints ----

  /** Unwrap a superjson-wrapped error into a clean string (stack trace if available, else message) */
  function parseError(raw: unknown): string | null {
    if (!raw) return null;
    const parsed = parseOutput(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      // Stack already includes the message as its first line
      if (typeof obj.stack === "string") return obj.stack;
      if (typeof obj.message === "string") return obj.message;
    }
    if (typeof parsed === "string") return parsed;
    if (typeof raw === "string") return raw;
    return null;
  }

  // GET /api/runs?workflow=NAME&limit=N
  if (url.startsWith("/api/runs") && method === "GET") {
    const fullUrl = req.url ?? "";

    // GET /api/runs/:runId/trace
    const traceMatch = fullUrl.match(/^\/api\/runs\/([^/]+)\/trace/);
    if (traceMatch) {
      const runId = decodeURIComponent(traceMatch[1]);
      try {
        // Get workflow metadata
        const workflowResult = await ctx.pool.query(
          `SELECT
            workflow_uuid, name, status, created_at, updated_at,
            (updated_at - created_at) as duration_ms,
            output::text, error
          FROM ${ctx.schema}.workflow_status
          WHERE workflow_uuid = $1`,
          [runId],
        );

        if (workflowResult.rows.length === 0) {
          jsonResponse(res, 404, { error: "Run not found" });
          return true;
        }

        const workflow = workflowResult.rows[0];
        workflow.output = parseOutput(workflow.output);
        workflow.error = parseError(workflow.error);

        // Get operations with hierarchy using recursive CTE
        const opsResult = await ctx.pool.query(
          `WITH RECURSIVE workflow_tree AS (
            SELECT workflow_uuid, workflow_uuid as root_uuid, 0 as depth
            FROM ${ctx.schema}.workflow_status
            WHERE workflow_uuid = $1
            UNION
            SELECT ws.workflow_uuid, wt.root_uuid, wt.depth + 1
            FROM ${ctx.schema}.workflow_status ws
            JOIN ${ctx.schema}.operation_outputs oo ON oo.child_workflow_id = ws.workflow_uuid
            JOIN workflow_tree wt ON oo.workflow_uuid = wt.workflow_uuid
          )
          SELECT
            oo.workflow_uuid, wt.depth, oo.function_id, oo.function_name,
            oo.child_workflow_id, oo.started_at_epoch_ms, oo.completed_at_epoch_ms,
            (oo.completed_at_epoch_ms - oo.started_at_epoch_ms) as duration_ms,
            oo.output::text as output_preview, oo.error
          FROM workflow_tree wt
          JOIN ${ctx.schema}.operation_outputs oo ON oo.workflow_uuid = wt.workflow_uuid
          ORDER BY oo.started_at_epoch_ms, wt.depth, oo.function_id`,
          [runId],
        );

        // Unwrap superjson in operation output previews and errors
        const operations = opsResult.rows.map((op: Record<string, unknown>) => {
          if (op.output_preview) {
            const parsed = parseOutput(op.output_preview);
            op.output_preview = parsed !== null ? JSON.stringify(parsed) : null;
          }
          op.error = parseError(op.error);
          return op;
        });

        jsonResponse(res, 200, { workflow, operations });
      } catch (err) {
        jsonResponse(res, 500, {
          error: err instanceof Error ? err.message : "Failed to get trace",
        });
      }
      return true;
    }

    // GET /api/runs (list)
    if (fullUrl.match(/^\/api\/runs(\?|$)/)) {
      try {
        const params = new URL(fullUrl, "http://localhost").searchParams;
        const workflowName = params.get("workflow");
        const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 200);

        const queryParams: (string | number)[] = [];
        let query = `
          SELECT workflow_uuid, name, status, created_at, updated_at, output::text, error
          FROM ${ctx.schema}.workflow_status
          WHERE LENGTH(workflow_uuid) = 36
        `;

        if (workflowName) {
          queryParams.push(workflowName);
          query += ` AND name = $${queryParams.length}`;
        }

        queryParams.push(limit);
        query += ` ORDER BY created_at DESC LIMIT $${queryParams.length}`;

        const result = await ctx.pool.query(query, queryParams);

        // Unwrap superjson output and errors for each run
        const runs = result.rows.map((row: Record<string, unknown>) => {
          row.output = parseOutput(row.output);
          row.error = parseError(row.error);
          return row;
        });

        jsonResponse(res, 200, runs);
      } catch (err) {
        jsonResponse(res, 500, {
          error: err instanceof Error ? err.message : "Failed to list runs",
        });
      }
      return true;
    }
  }

  // POST /api/workflows/:name/run — execute a workflow via subprocess
  const runMatch = url.match(/^\/api\/workflows\/([^/]+)\/run$/);
  if (runMatch && method === "POST") {
    const workflowName = decodeURIComponent(runMatch[1]);
    const body = (await parseBody(req)) as { input?: Record<string, unknown> };
    const input = body.input ?? {};

    const [runtime, script] = process.argv;
    try {
      const { stdout } = await execFileAsync(runtime, [
        ...process.execArgv,
        script,
        "workflow", "run", workflowName,
        "--json",
        "-i", JSON.stringify(input),
      ], { cwd: ctx.projectRoot });

      jsonResponse(res, 200, JSON.parse(stdout));
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      if (execErr.stdout) {
        try {
          jsonResponse(res, 200, JSON.parse(execErr.stdout));
          return true;
        } catch { /* fall through */ }
      }
      jsonResponse(res, 500, {
        status: "ERROR",
        error: execErr.stderr?.trim() || execErr.message || String(err),
      });
    }
    return true;
  }

  return false;
}
