// packages/cli/src/trace.ts
import pg from "pg";
import pc from "picocolors";
import { getSchemaName } from "../index.js";
import { getAppName } from "./app.js";
import { getRun, type WorkflowRun } from "./runs.js";

export interface WorkflowTrace extends WorkflowRun {
  duration_ms: number | null;
  inputs: unknown;
}

export interface OperationTrace {
  workflow_uuid: string;
  depth: number;
  function_id: number;
  function_name: string;
  child_workflow_id: string | null;
  started_at_epoch_ms: number;
  completed_at_epoch_ms: number | null;
  duration_ms: number | null;
  output_preview: string | null;
  error: string | null;
}

export interface TraceResult {
  workflow: WorkflowTrace | null;
  operations: OperationTrace[];
  ambiguous?: boolean;
}

/**
 * Get workflow trace including all operations and child workflows
 */
export async function getTrace(
  databaseUrl: string,
  runId: string,
  schemaOverride?: string
): Promise<TraceResult> {
  // Use getRun for ID resolution (reuses existing short hash logic)
  const { run, ambiguous } = await getRun(databaseUrl, runId, schemaOverride);

  if (ambiguous) {
    return { workflow: null, operations: [], ambiguous: true };
  }
  if (!run) {
    return { workflow: null, operations: [] };
  }

  // Get trace data using resolved ID
  return getTraceData(databaseUrl, run.workflow_uuid, schemaOverride);
}

async function getTraceData(
  databaseUrl: string,
  workflowUuid: string,
  schemaOverride?: string
): Promise<TraceResult> {
  const schema = schemaOverride ?? getSchemaName(getAppName());
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    // Get workflow metadata with additional trace fields (inputs, duration)
    const workflowResult = await client.query(
      `SELECT
        workflow_uuid,
        name,
        status,
        created_at,
        updated_at,
        (updated_at - created_at) as duration_ms,
        inputs::text,
        output::text,
        error
      FROM ${schema}.workflow_status
      WHERE workflow_uuid = $1`,
      [workflowUuid]
    );

    if (workflowResult.rows.length === 0) {
      return { workflow: null, operations: [] };
    }

    const workflow = workflowResult.rows[0] as WorkflowTrace;

    // Get all operations with hierarchy using recursive CTE
    const operationsResult = await client.query(
      `WITH RECURSIVE workflow_tree AS (
        -- Start with the main workflow
        SELECT workflow_uuid, workflow_uuid as root_uuid, 0 as depth
        FROM ${schema}.workflow_status
        WHERE workflow_uuid = $1

        UNION

        -- Find child workflows via child_workflow_id references (UNION dedupes)
        SELECT ws.workflow_uuid, wt.root_uuid, wt.depth + 1
        FROM ${schema}.workflow_status ws
        JOIN ${schema}.operation_outputs oo ON oo.child_workflow_id = ws.workflow_uuid
        JOIN workflow_tree wt ON oo.workflow_uuid = wt.workflow_uuid
      )
      SELECT
        oo.workflow_uuid,
        wt.depth,
        oo.function_id,
        oo.function_name,
        oo.child_workflow_id,
        oo.started_at_epoch_ms,
        oo.completed_at_epoch_ms,
        (oo.completed_at_epoch_ms - oo.started_at_epoch_ms) as duration_ms,
        oo.output::text as output_preview,
        oo.error
      FROM workflow_tree wt
      JOIN ${schema}.operation_outputs oo ON oo.workflow_uuid = wt.workflow_uuid
      ORDER BY oo.started_at_epoch_ms, wt.depth, oo.function_id`,
      [workflowUuid]
    );

    return {
      workflow,
      operations: operationsResult.rows as OperationTrace[],
    };
  } finally {
    await client.end();
  }
}

// ---- Formatting and display ----

function formatStatus(status: string): string {
  switch (status) {
    case "SUCCESS":
      return pc.green(status);
    case "ERROR":
      return pc.red(status);
    case "PENDING":
      return pc.yellow(status);
    default:
      return status;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return pc.dim("pending");
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Parse and unwrap DBOS/superjson output format
 * Handles: raw values, JSON strings, and {"json": ..., "__dbos_serializer": "superjson"} wrappers
 */
export function parseOutput(output: unknown): unknown {
  if (output === null || output === undefined) return null;
  try {
    const parsed = typeof output === "string" ? JSON.parse(output) : output;
    // Unwrap superjson/DBOS wrapper if present
    if (parsed && typeof parsed === "object" && "json" in parsed) {
      return (parsed as { json: unknown }).json;
    }
    return parsed;
  } catch {
    return output;
  }
}

function formatOutputPreview(output: string | null): string {
  if (!output) return "";
  try {
    let value = parseOutput(output);

    // For tool call recordings, show tool name and inputs
    if (value && typeof value === "object" && "toolName" in value) {
      const record = value as Record<string, unknown>;
      const toolName = record.toolName;
      // Inputs may be at top level or nested in result.action
      const inputs = record.inputs ?? (record.result as Record<string, unknown> | undefined)?.action;
      if (inputs !== undefined) {
        const inputStr = JSON.stringify(inputs);
        const truncated = inputStr.length > 60 ? inputStr.slice(0, 57) + "..." : inputStr;
        return `${toolName}(${truncated})`;
      }
      return String(toolName);
    }

    const str = JSON.stringify(value);
    // Truncate long output
    if (str.length > 80) {
      return str.slice(0, 77) + "...";
    }
    return str;
  } catch {
    return output.slice(0, 80);
  }
}

/**
 * Print a workflow trace as a tree to stdout
 */
export function printTrace(trace: TraceResult): void {
  const { workflow, operations } = trace;
  if (!workflow) return;

  console.log();
  console.log(`Workflow: ${pc.cyan(workflow.name)} ${pc.dim(`(${workflow.workflow_uuid})`)}`);
  console.log(`Status: ${formatStatus(workflow.status)} | Duration: ${formatDuration(workflow.duration_ms)}`);
  console.log();

  if (operations.length === 0) {
    console.log(pc.dim("No operations recorded"));
    console.log();
    return;
  }

  // Group operations by parent workflow
  const byWorkflow = new Map<string, OperationTrace[]>();
  for (const op of operations) {
    const list = byWorkflow.get(op.workflow_uuid) || [];
    list.push(op);
    byWorkflow.set(op.workflow_uuid, list);
  }

  // Get main workflow operations, filtering out agent start ops (show only DBOS.getResult for child workflows)
  const mainOps = byWorkflow.get(workflow.workflow_uuid) || [];

  // Find child workflow IDs that have a DBOS.getResult - we'll show child ops there instead of at start
  const childWorkflowsWithGetResult = new Set<string>();
  for (const op of mainOps) {
    if (op.function_name === "DBOS.getResult" && op.child_workflow_id) {
      childWorkflowsWithGetResult.add(op.child_workflow_id);
    }
  }

  // Filter out operations that just start a child workflow (no output, DBOS.getResult will show it)
  const filteredOps = mainOps.filter((op) => {
    // Keep if not a child workflow start
    if (!op.child_workflow_id) return true;
    // Keep if it's DBOS.getResult (this is where we show child ops)
    if (op.function_name === "DBOS.getResult") return true;
    // Skip agent start ops if there's a corresponding DBOS.getResult
    if (childWorkflowsWithGetResult.has(op.child_workflow_id)) return false;
    // Keep otherwise (no DBOS.getResult for this child)
    return true;
  });

  const totalOps = filteredOps.length;

  for (let i = 0; i < filteredOps.length; i++) {
    const op = filteredOps[i];
    const isLast = i === totalOps - 1;
    const prefix = isLast ? "└─" : "├─";
    const continuePrefix = isLast ? "   " : "│  ";

    // For DBOS.getResult with child workflow, show the child workflow name instead
    let displayName = op.function_name;
    if (op.function_name === "DBOS.getResult" && op.child_workflow_id) {
      // Find the corresponding start operation to get the agent name
      const startOp = mainOps.find(
        (o) => o.child_workflow_id === op.child_workflow_id && o.function_name !== "DBOS.getResult"
      );
      if (startOp) {
        displayName = startOp.function_name;
      }
    }

    // Print operation line with duration right-aligned
    const duration = formatDuration(op.duration_ms);
    const padding = Math.max(1, 50 - displayName.length);
    console.log(`${prefix} ${pc.bold(displayName)}${" ".repeat(padding)}${pc.yellow(duration)}`);

    // Print error if present
    if (op.error) {
      console.log(`${continuePrefix}  ${pc.red("✗ " + op.error)}`);
    }

    // Print child workflow operations if this is a child workflow call
    if (op.child_workflow_id) {
      const childOps = byWorkflow.get(op.child_workflow_id) || [];
      for (let j = 0; j < childOps.length; j++) {
        const childOp = childOps[j];
        const childIsLast = j === childOps.length - 1;
        const childPrefix = childIsLast ? "└─" : "├─";
        const childContinuePrefix = childIsLast ? "   " : "│  ";

        const childName = childOp.function_name;
        const childDuration = formatDuration(childOp.duration_ms);
        const childPadding = Math.max(1, 47 - childName.length);
        console.log(
          `${continuePrefix}  ${childPrefix} ${childName}${" ".repeat(childPadding)}${pc.yellow(childDuration)}`
        );

        if (childOp.error) {
          console.log(`${continuePrefix}  ${childContinuePrefix}  ${pc.red("✗ " + childOp.error)}`);
        }

        const childPreview = formatOutputPreview(childOp.output_preview);
        if (childPreview && !childOp.error) {
          console.log(`${continuePrefix}  ${childContinuePrefix}  ${pc.dim("→")} ${pc.dim(childPreview)}`);
        }
      }

      // Show the agent/child workflow result after its operations
      const agentResult = formatOutputPreview(op.output_preview);
      if (agentResult && !op.error) {
        console.log(`${continuePrefix}  ${pc.dim("Result:")} ${pc.dim(agentResult)}`);
      }
    }

    // Print output preview if present (only for non-child-workflow operations)
    const preview = formatOutputPreview(op.output_preview);
    if (preview && !op.error && !op.child_workflow_id) {
      console.log(`${continuePrefix}  ${pc.dim("→")} ${pc.dim(preview)}`);
    }

    // Add blank line between operations for readability (except after last)
    if (!isLast) {
      console.log("│");
    }
  }

  // Print final output (full, pretty-printed)
  if (workflow.output) {
    console.log();
    console.log(pc.green("Final:"));
    const value = parseOutput(workflow.output);
    console.log(JSON.stringify(value, null, 2));
  }
  console.log();
}
