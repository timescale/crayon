import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { listRuns } from "../../runs.js";
import { requireDatabaseUrl, parseOutput } from "./utils.js";

const inputSchema = {
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of runs to return (default: 20)"),
  workflow_name: z
    .string()
    .optional()
    .describe("Filter by workflow name"),
} as const;

const outputSchema = {
  runs: z
    .array(
      z.object({
        workflow_uuid: z.string(),
        name: z.string(),
        status: z.string(),
        created_at: z.string(),
        output: z.unknown().optional(),
        error: z.string().nullable().optional(),
      }),
    )
    .describe("List of workflow runs, most recent first"),
  error: z.string().optional().describe("Error message if query failed"),
} as const;

type RunOutput = {
  workflow_uuid: string;
  name: string;
  status: string;
  created_at: string;
  output?: unknown;
  error?: string | null;
};

type OutputSchema = {
  runs: RunOutput[];
  error?: string;
};

export const listRunsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_runs",
    config: {
      title: "List Runs",
      description:
        "List recent workflow executions. " +
        "Returns run IDs, workflow names, statuses, and timestamps. " +
        "Use get_run or get_trace with a run ID for details.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ limit, workflow_name }): Promise<OutputSchema> => {
      let databaseUrl: string;
      try {
        databaseUrl = requireDatabaseUrl();
      } catch (err) {
        return { runs: [], error: err instanceof Error ? err.message : String(err) };
      }

      try {
        const runs = await listRuns(databaseUrl, {
          limit,
          workflowName: workflow_name,
        });

        return {
          runs: runs.map((r) => ({
            workflow_uuid: r.workflow_uuid,
            name: r.name,
            status: r.status,
            created_at: String(r.created_at),
            output: r.output ? parseOutput(r.output) : undefined,
            error: r.error,
          })),
        };
      } catch (err) {
        return {
          runs: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
