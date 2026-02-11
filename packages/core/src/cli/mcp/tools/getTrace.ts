import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { getTrace } from "../../trace.js";
import { requireDatabaseUrl, parseOutput } from "./utils.js";

const inputSchema = {
  run_id: z
    .string()
    .describe("Workflow run UUID or short prefix (like git short hashes)"),
} as const;

const outputSchema = {
  workflow: z
    .object({
      workflow_uuid: z.string(),
      name: z.string(),
      status: z.string(),
      created_at: z.string(),
      duration_ms: z.number().nullable(),
      output: z.unknown().optional(),
      error: z.string().nullable().optional(),
    })
    .nullable()
    .describe("Workflow metadata, or null if not found"),
  operations: z
    .array(
      z.object({
        workflow_uuid: z.string(),
        depth: z.number(),
        function_id: z.number(),
        function_name: z.string(),
        child_workflow_id: z.string().nullable(),
        duration_ms: z.number().nullable(),
        output_preview: z.string().nullable(),
        error: z.string().nullable(),
      }),
    )
    .describe("Ordered list of operations in the execution tree"),
  ambiguous: z
    .boolean()
    .optional()
    .describe("True if the run ID prefix matched multiple runs"),
  error: z.string().optional().describe("Error message if query failed"),
} as const;

type WorkflowOutput = {
  workflow_uuid: string;
  name: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  output?: unknown;
  error?: string | null;
} | null;

type OperationOutput = {
  workflow_uuid: string;
  depth: number;
  function_id: number;
  function_name: string;
  child_workflow_id: string | null;
  duration_ms: number | null;
  output_preview: string | null;
  error: string | null;
};

type OutputSchema = {
  workflow: WorkflowOutput;
  operations: OperationOutput[];
  ambiguous?: boolean;
  error?: string;
};

export const getTraceFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "get_trace",
    config: {
      title: "Get Trace",
      description:
        "Get the full execution trace for a workflow run, including all operations, " +
        "child workflows, timings, and outputs. " +
        "Supports git-style short hash prefixes for run IDs.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ run_id }): Promise<OutputSchema> => {
      let databaseUrl: string;
      try {
        databaseUrl = requireDatabaseUrl();
      } catch (err) {
        return { workflow: null, operations: [], error: err instanceof Error ? err.message : String(err) };
      }

      try {
        const trace = await getTrace(databaseUrl, run_id);

        if (trace.ambiguous) {
          return {
            workflow: null,
            operations: [],
            ambiguous: true,
            error: `Ambiguous prefix "${run_id}" — matches multiple runs. Use a longer prefix.`,
          };
        }

        if (!trace.workflow) {
          return { workflow: null, operations: [] };
        }

        return {
          workflow: {
            workflow_uuid: trace.workflow.workflow_uuid,
            name: trace.workflow.name,
            status: trace.workflow.status,
            created_at: String(trace.workflow.created_at),
            duration_ms: trace.workflow.duration_ms != null ? Number(trace.workflow.duration_ms) : null,
            output: trace.workflow.output ? parseOutput(trace.workflow.output) : undefined,
            error: trace.workflow.error,
          },
          operations: trace.operations.map((op) => ({
            workflow_uuid: op.workflow_uuid,
            depth: Number(op.depth),
            function_id: Number(op.function_id),
            function_name: op.function_name,
            child_workflow_id: op.child_workflow_id,
            duration_ms: op.duration_ms != null ? Number(op.duration_ms) : null,
            output_preview: op.output_preview,
            error: op.error,
          })),
        };
      } catch (err) {
        return {
          workflow: null,
          operations: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
